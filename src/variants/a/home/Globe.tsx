import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useSite } from '../../../core/provider';
import { colorToRgba, cssVar, dpr, useRafLoop } from '../../../core/fx/hooks';
import { pct, wanLabel } from '../../../core/data/format';
import { useModelColor, clamp, useSize } from '../lib';
import { landDots, lonLatToXyz } from './landmask';

type RGBA = [number, number, number, number];
interface Palette { ink: RGBA; ink3: RGBA; accent: RGBA; models: RGBA[]; surface: RGBA; signal: RGBA; dark: boolean }
interface Orbit { id: string; r: number; inc: number; raan: number; speed: number; phase0: number; size: number }
interface SatScreen { id: string; x: number; y: number; front: boolean }

const MODEL_VARS = ['--va-m1', '--va-m2', '--va-m3', '--va-m4', '--va-m5'];
const BASE_PITCH = 0.36;
/** 让东经约 108° 朝向观察者 */
const START_SPIN = -Math.PI / 2 - (108 * Math.PI) / 180 + Math.PI * 2;
const STATION = lonLatToXyz(116.4, 39.9);
const LIGHT = (() => { const v = [-0.5, 0.62, 0.62]; const l = Math.hypot(v[0], v[1], v[2]); return v.map(x => x / l); })();

const rgba = (c: RGBA, a: number) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;

function readPalette(dark: boolean): Palette {
  const c = (name: string) => colorToRgba(cssVar(name) || '#888');
  return { ink: c('--va-ink-1'), ink3: c('--va-ink-3'), accent: c('--accent'), models: MODEL_VARS.map(c), surface: c('--va-surface'), signal: c('--va-signal'), dark };
}

/** 轨道坐标（惯性系）：轨道面倾角 inc、升交点 raan */
function orbitPoint(o: Orbit, th: number): [number, number, number] {
  const x = o.r * Math.cos(th);
  const y = o.r * Math.sin(th) * Math.sin(o.inc);
  const z = -o.r * Math.sin(th) * Math.cos(o.inc);
  const cr = Math.cos(o.raan), sr = Math.sin(o.raan);
  return [x * cr + z * sr, y, -x * sr + z * cr];
}

function rotate(p: [number, number, number], yaw: number, pitch: number): [number, number, number] {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const x1 = p[0] * cy + p[2] * sy, z1 = -p[0] * sy + p[2] * cy;
  return [x1, p[1] * cp - z1 * sp, p[1] * sp + z1 * cp];
}

/**
 * 点阵地球 + 三条型号轨道（Canvas 2D）。
 * - 陆地点按朝光程度分 5 档批量绘制，背面点极淡；
 * - 卫星大小和速度都对应型号年度收入；测控站与可见卫星之间画流动的虚线链路；
 * - 拖拽旋转，松手后带惯性；悬停 / 轻点卫星弹出型号卡片；
 * - fx 关闭时不跑循环，停在东亚朝前的静态画面，拖拽时按需重绘。
 */
export function Globe() {
  const { fx, isDark, accent, derived } = useSite();
  const modelColor = useModelColor();
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const hdg = useRef<HTMLSpanElement>(null);
  const size = useSize(wrap);
  const dots = useMemo(() => landDots(), []);
  const models = derived.models;
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [pinId, setPinId] = useState<string | null>(null);
  const activeId = hoverId ?? pinId;

  const orbits: Orbit[] = useMemo(() => {
    const maxRev = Math.max(1, ...models.map(m => m.revenue));
    const inc = [0.95, 0.38, 1.32, 0.7, 1.1], raan = [0.35, 2.3, 4.2, 1.2, 3.3], ph = [0.9, 3.1, 5.0, 2.0, 4.1];
    return models.map((m, i) => {
      const share = m.revenue / maxRev;
      return { id: m.id, r: 1.16 + (i % 5) * 0.13, inc: inc[i % 5], raan: raan[i % 5], phase0: ph[i % 5], speed: 0.12 + 0.3 * share, size: 2.4 + 2.8 * share };
    });
  }, [models]);

  const st = useRef({
    spin: START_SPIN, camYaw: 0, pitch: BASE_PITCH, vYaw: 0, t: 0,
    dragging: false, lastX: 0, lastY: 0, lastT: 0, moved: 0, pointerId: -1,
    w: 0, h: 0, ratio: 1, pal: null as Palette | null, sats: [] as SatScreen[], active: null as string | null, frame: 0,
  });
  const fxRef = useRef(fx);
  fxRef.current = fx;
  const orbitsRef = useRef(orbits);
  orbitsRef.current = orbits;
  st.current.active = activeId;

  // 预分配分档缓冲
  const buckets = useMemo(() => Array.from({ length: 6 }, () => new Float32Array(dots.length / 3 * 2)), [dots]);

  const draw = useCallback((_time: number, dt: number) => {
    const s = st.current, cv = canvas.current, pal = s.pal;
    if (!cv || !pal || !s.w) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const f = fxRef.current;
    const k = f.intensity;
    if (f.motion) {
      if (!s.dragging) {
        s.camYaw += s.vYaw * dt;
        s.vYaw *= Math.exp(-dt * 2.2);
        s.pitch += (BASE_PITCH - s.pitch) * (1 - Math.exp(-dt * 0.9));
      }
      s.spin += dt * 0.085 * k;
      s.t += dt * k;
    }
    const { w, h, ratio } = s;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const R = Math.min(w, h) / 2 / 1.62;
    const ink = pal.ink, acc = pal.accent;

    // 大气辉光 + 球体底
    const glow = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.28);
    glow.addColorStop(0, rgba(acc, pal.dark ? 0.16 : 0.1));
    glow.addColorStop(1, rgba(acc, 0));
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.28, 0, Math.PI * 2); ctx.fill();
    const body = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.45, R * 0.1, cx, cy, R);
    body.addColorStop(0, rgba(pal.surface, pal.dark ? 0.96 : 1));
    body.addColorStop(0.75, rgba(pal.surface, pal.dark ? 0.94 : 0.97));
    body.addColorStop(1, rgba(acc, pal.dark ? 0.16 : 0.07));
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = rgba(ink, pal.dark ? 0.16 : 0.12);
    ctx.lineWidth = 1;
    ctx.stroke();

    // 点阵
    const yaw = s.spin + s.camYaw;
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(s.pitch), sp = Math.sin(s.pitch);
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < dots.length; i += 3) {
      const x = dots[i], y = dots[i + 1], z = dots[i + 2];
      const x1 = x * cyw + z * syw, z1 = -x * syw + z * cyw;
      const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
      let b: number;
      if (z2 < 0) b = 0;
      else {
        const lit = x1 * LIGHT[0] + y2 * LIGHT[1] + z2 * LIGHT[2];
        b = lit < 0.15 ? 1 : lit < 0.42 ? 2 : lit < 0.66 ? 3 : lit < 0.84 ? 4 : 5;
      }
      const buf = buckets[b];
      buf[counts[b]++] = cx + x1 * R;
      buf[counts[b]++] = cy - y2 * R;
    }
    const styles: [string, number][] = [
      [rgba(ink, pal.dark ? 0.07 : 0.06), 1.1],
      [rgba(ink, pal.dark ? 0.22 : 0.2), 1.5],
      [rgba(ink, pal.dark ? 0.36 : 0.34), 1.6],
      [rgba(acc, pal.dark ? 0.5 : 0.48), 1.7],
      [rgba(acc, 0.72), 1.8],
      [rgba(acc, 0.95), 1.9],
    ];
    for (let b = 0; b < 6; b++) {
      const buf = buckets[b], n = counts[b], [style, sz] = styles[b];
      if (!n) continue;
      ctx.fillStyle = style;
      ctx.beginPath();
      const hs = sz / 2;
      for (let i = 0; i < n; i += 2) ctx.rect(buf[i] - hs, buf[i + 1] - hs, sz, sz);
      ctx.fill();
    }

    // HUD 刻度环（缓慢转动）+ 四向准星
    const ringR = R * 1.075;
    ctx.strokeStyle = rgba(ink, pal.dark ? 0.14 : 0.12);
    ctx.beginPath(); ctx.arc(cx, cy, ringR, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    const rot = s.t * 0.04;
    for (let i = 0; i < 72; i++) {
      const a = rot + (i / 72) * Math.PI * 2;
      const len = i % 6 === 0 ? 7 : 3;
      ctx.moveTo(cx + Math.cos(a) * ringR, cy + Math.sin(a) * ringR);
      ctx.lineTo(cx + Math.cos(a) * (ringR + len), cy + Math.sin(a) * (ringR + len));
    }
    ctx.strokeStyle = rgba(ink, pal.dark ? 0.22 : 0.2);
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      ctx.moveTo(cx + Math.cos(a) * R * 1.52, cy + Math.sin(a) * R * 1.52);
      ctx.lineTo(cx + Math.cos(a) * R * 1.6, cy + Math.sin(a) * R * 1.6);
    }
    ctx.strokeStyle = rgba(ink, 0.3);
    ctx.stroke();

    // 测控站
    const stp = rotate(STATION, yaw, s.pitch);
    const stScreen = { x: cx + stp[0] * R, y: cy - stp[1] * R, front: stp[2] > 0.05 };
    const stWorld: [number, number, number] = stp;

    // 轨道、尾迹、卫星
    const os = orbitsRef.current;
    const sats: SatScreen[] = [];
    const proj = (p: [number, number, number]) => {
      const q = rotate(p, s.camYaw, s.pitch);
      return { x: cx + q[0] * R, y: cy - q[1] * R, z: q[2], hidden: q[2] < 0 && q[0] * q[0] + q[1] * q[1] < 1, w: q };
    };
    ctx.lineCap = 'round';
    os.forEach((o, i) => {
      const col = pal.models[i % pal.models.length];
      const active = s.active === o.id;
      const dim = s.active && !active;
      const N = 200;
      const front = new Path2D(), back = new Path2D();
      let penF = false, penB = false;
      for (let j = 0; j <= N; j++) {
        const p = proj(orbitPoint(o, (j / N) * Math.PI * 2));
        if (p.hidden) { penF = false; if (penB) back.lineTo(p.x, p.y); else { back.moveTo(p.x, p.y); penB = true; } }
        else { penB = false; if (penF) front.lineTo(p.x, p.y); else { front.moveTo(p.x, p.y); penF = true; } }
      }
      ctx.lineWidth = active ? 1.6 : 1;
      ctx.strokeStyle = rgba(col, dim ? 0.12 : active ? 0.85 : 0.42);
      ctx.stroke(front);
      ctx.setLineDash([2, 5]);
      ctx.strokeStyle = rgba(col, dim ? 0.05 : 0.16);
      ctx.stroke(back);
      ctx.setLineDash([]);

      const th = o.phase0 + s.t * o.speed;
      // 尾迹
      const segs = 26, span = 0.85;
      let prev = proj(orbitPoint(o, th - span));
      for (let j = 1; j <= segs; j++) {
        const p = proj(orbitPoint(o, th - span + (span * j) / segs));
        if (!p.hidden && !prev.hidden) {
          ctx.strokeStyle = rgba(col, (j / segs) * (dim ? 0.2 : 0.9));
          ctx.lineWidth = 1 + (j / segs) * 1.6;
          ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); ctx.stroke();
        }
        prev = p;
      }
      const sp3 = orbitPoint(o, th);
      const p = proj(sp3);
      sats.push({ id: o.id, x: p.x, y: p.y, front: !p.hidden });
      const a = p.hidden ? 0.25 : dim ? 0.4 : 1;
      if (!p.hidden) {
        const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, o.size * 5);
        halo.addColorStop(0, rgba(col, 0.38 * a));
        halo.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(p.x, p.y, o.size * 5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = rgba(col, a);
      ctx.beginPath(); ctx.arc(p.x, p.y, o.size, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgba(pal.surface, a);
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, o.size * 0.38), 0, Math.PI * 2); ctx.fill();
      if (active) {
        ctx.strokeStyle = rgba(col, 0.9);
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(p.x, p.y, o.size + 7, 0, Math.PI * 2); ctx.stroke();
      }
      if (!p.hidden) {
        ctx.font = `500 10.5px ui-monospace, "SF Mono", Menlo, monospace`;
        ctx.fillStyle = rgba(ink, dim ? 0.35 : 0.78);
        ctx.fillText(o.id, p.x + o.size + 7, p.y - o.size - 4);
      }

      // 测控链路：卫星在测控站地平线以上时连线
      if (stScreen.front && !p.hidden) {
        const sw = rotate(sp3, s.camYaw, s.pitch);
        const dx = sw[0] - stWorld[0], dy = sw[1] - stWorld[1], dz = sw[2] - stWorld[2];
        if (dx * stWorld[0] + dy * stWorld[1] + dz * stWorld[2] > 0.05) {
          ctx.setLineDash([3, 4]);
          ctx.lineDashOffset = -s.t * 18;
          ctx.strokeStyle = rgba(col, dim ? 0.12 : 0.5);
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(stScreen.x, stScreen.y); ctx.lineTo(p.x, p.y); ctx.stroke();
          ctx.setLineDash([]);
          ctx.lineDashOffset = 0;
        }
      }
    });
    if (stScreen.front) {
      const pulse = f.motion ? (s.t * 0.55) % 1 : 0.6;
      ctx.strokeStyle = rgba(pal.signal, 0.7 * (1 - pulse));
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(stScreen.x, stScreen.y, 4 + pulse * 14, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = rgba(pal.signal, 1);
      ctx.beginPath();
      ctx.moveTo(stScreen.x, stScreen.y - 4); ctx.lineTo(stScreen.x + 4, stScreen.y); ctx.lineTo(stScreen.x, stScreen.y + 4); ctx.lineTo(stScreen.x - 4, stScreen.y);
      ctx.closePath(); ctx.fill();
    }
    s.sats = sats;

    // 卡片跟随卫星
    const el = card.current;
    if (el && s.active) {
      const sat = sats.find(x => x.id === s.active);
      if (sat) {
        const flip = sat.x > w * 0.55;
        const tx = flip ? sat.x - 18 : sat.x + 18;
        const ty = clamp(sat.y, 70, h - 70);
        el.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) translate(${flip ? '-100%' : '0'}, -50%)`;
      }
    }
    // 航向读数（每 6 帧更新一次文字）
    s.frame++;
    if (hdg.current && (s.frame % 6 === 0 || !f.motion)) {
      const deg = ((((-yaw * 180) / Math.PI) % 360) + 360) % 360;
      hdg.current.textContent = `${deg.toFixed(1).padStart(5, '0')}°`;
    }
  }, [dots, buckets]);

  // 关闭特效时按需重绘
  const rafOnce = useRef(0);
  const requestDraw = useCallback(() => {
    if (fxRef.current.motion) return;
    cancelAnimationFrame(rafOnce.current);
    rafOnce.current = requestAnimationFrame(() => draw(0, 0));
  }, [draw]);
  useEffect(() => () => cancelAnimationFrame(rafOnce.current), []);

  useEffect(() => {
    st.current.pal = readPalette(isDark);
    requestDraw();
  }, [isDark, accent.hex, requestDraw]);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !size.width) return;
    const ratio = dpr(2);
    cv.width = Math.round(size.width * ratio);
    cv.height = Math.round(size.height * ratio);
    Object.assign(st.current, { w: size.width, h: size.height, ratio });
    requestDraw();
    if (fxRef.current.motion) draw(0, 0);
  }, [size.width, size.height, draw, requestDraw]);

  useEffect(() => { requestDraw(); }, [activeId, orbits, fx.motion, requestDraw]);

  useRafLoop(draw, { active: fx.motion, target: wrap });

  const hit = (x: number, y: number) => {
    let best: string | null = null, dist = 22;
    for (const sat of st.current.sats) {
      const d = Math.hypot(sat.x - x, sat.y - y);
      if (d < dist) { dist = d; best = sat.id; }
    }
    return best;
  };
  const local = (e: RPointerEvent) => {
    const r = wrap.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onDown = (e: RPointerEvent<HTMLCanvasElement>) => {
    const s = st.current;
    s.dragging = true; s.moved = 0; s.vYaw = 0;
    s.lastX = e.clientX; s.lastY = e.clientY; s.lastT = performance.now(); s.pointerId = e.pointerId;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 合成事件或已释放的指针 */ }
  };
  const onMove = (e: RPointerEvent<HTMLCanvasElement>) => {
    const s = st.current;
    if (s.dragging && e.pointerId === s.pointerId) {
      const dx = e.clientX - s.lastX, dy = e.clientY - s.lastY;
      const now = performance.now();
      const dts = Math.max(8, now - s.lastT) / 1000;
      s.camYaw += dx * 0.0065;
      s.pitch = clamp(s.pitch + dy * 0.004, -0.15, 0.95);
      s.vYaw = s.vYaw * 0.6 + ((dx * 0.0065) / dts) * 0.4;
      s.lastX = e.clientX; s.lastY = e.clientY; s.lastT = now;
      s.moved += Math.abs(dx) + Math.abs(dy);
      if (s.moved > 4) e.currentTarget.style.cursor = 'grabbing';
      requestDraw();
      return;
    }
    if (e.pointerType === 'mouse') {
      const p = local(e);
      const id = hit(p.x, p.y);
      e.currentTarget.style.cursor = id ? 'pointer' : 'grab';
      if (id !== hoverId) setHoverId(id);
    }
  };
  const onUp = (e: RPointerEvent<HTMLCanvasElement>) => {
    const s = st.current;
    if (!s.dragging) return;
    s.dragging = false;
    e.currentTarget.style.cursor = 'grab';
    if (performance.now() - s.lastT > 90) s.vYaw = 0;
    s.vYaw = clamp(s.vYaw, -4, 4);
    if (s.moved < 6) {
      const p = local(e);
      const id = hit(p.x, p.y);
      setPinId(cur => (id && cur !== id ? id : id ? null : null));
    }
  };

  const active = models.find(m => m.id === activeId) ?? null;
  const summary = models.map(m => `${m.id} 收入 ${wanLabel(m.revenue)}`).join('，');

  return (
    <div className="va-globe">
      <div ref={wrap} className="va-globe-stage">
        <canvas ref={canvas} className="va-globe-canvas" role="img"
          aria-label={`点阵地球与 ${models.length} 条型号轨道，卫星大小和速度对应年度收入：${summary}。可拖拽旋转。`}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          onPointerLeave={e => { if (e.pointerType === 'mouse' && !st.current.dragging) setHoverId(null); }} />
        <div className="va-globe-hud va-globe-hud-tl" aria-hidden="true">
          <span className="va-mono">TRACKING</span>
          <span className="va-mono va-hud-val">{models.length} ORBITS</span>
        </div>
        <div className="va-globe-hud va-globe-hud-br" aria-hidden="true">
          <span className="va-mono">HDG</span>
          <span ref={hdg} className="va-mono va-hud-val">000.0°</span>
        </div>
        <div ref={card} className={`va-sat-card${active ? ' is-on' : ''}`} aria-hidden={!active}>
          {active && (
            <>
              <p className="va-sat-card-head"><i style={{ background: modelColor(active.id) }} /> <b>{active.id}</b><span>{active.dept}</span></p>
              <dl>
                <div><dt>年度收入</dt><dd className="va-num">{wanLabel(active.revenue)}</dd></div>
                <div><dt>目标</dt><dd className="va-num">{wanLabel(active.target)}</dd></div>
                <div><dt>完成率</dt><dd className="va-num">{pct(active.completion)}</dd></div>
                <div><dt>回款率</dt><dd className="va-num">{pct(active.receivedRate)}</dd></div>
              </dl>
              <div className="va-sat-bar" aria-hidden="true"><span style={{ transform: `scaleX(${clamp(active.completion, 0, 1)})`, background: modelColor(active.id) }} /></div>
            </>
          )}
        </div>
      </div>
      <ul className="va-globe-keys" aria-label="型号轨道">
        {models.map(m => (
          <li key={m.id}>
            <button type="button" aria-pressed={pinId === m.id} className={activeId === m.id ? 'is-on' : ''}
              onPointerEnter={() => setHoverId(m.id)} onPointerLeave={() => setHoverId(null)}
              onFocus={() => setHoverId(m.id)} onBlur={() => setHoverId(null)}
              onClick={() => setPinId(cur => (cur === m.id ? null : m.id))}>
              <i style={{ background: modelColor(m.id) }} aria-hidden="true" />
              <span className="va-mono">{m.id}</span>
              <b className="va-num">{wanLabel(m.revenue, 0)}</b>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
