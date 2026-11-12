import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { useSite } from '../../../core/provider';
import { colorToRgba, dpr, useRafLoop } from '../../../core/fx/hooks';
import { landDots, lonLatToXyz } from './landmask';
import { clamp, useBox } from './util';
import './viz.css';

/**
 * 卫星（一颗对应一个型号）。
 * - size：相对权重（例如年度收入，单位随意），组件内部按最大值归一化成 3–5.6px 半径；
 * - color：任意 CSS 颜色，可以是 var(--vd-m1) 这类变量，内部解析后画到 canvas 上；
 * - value：悬停卡片里的主数值文字，例如「收入 1,520 万元」。
 * rows / progress 是 D 版补充的可选字段：卡片里的附加行、底部进度条（0–1）。
 */
export interface Satellite {
  id: string;
  label: string;
  color: string;
  size: number;
  value: string;
  rows?: { label: string; value: string }[];
  progress?: number;
}

type Vec3 = [number, number, number];
type RGBA = [number, number, number, number];
type Mode = 'horizon' | 'cockpit';
interface Palette { ink: RGBA; surface: RGBA; signal: RGBA; accent: RGBA; sats: Map<string, RGBA>; dark: boolean }
interface Orbit { id: string; r: number; inc: number; raan: number; roll: number; speed: number; size: number }
interface SatScreen { id: string; x: number; y: number; r: number; front: boolean }

/**
 * 两种模式的相机与轨道参数。
 * - cockpit：常规倾斜轨道，绕地球一圈；
 * - horizon：相机略低于赤道（看到赤道到中纬度，海陆相间），轨道面接近画面平面，弧线越过地平线；
 *   各轨道再绕视线方向转一点（roll），弧线不完全同心。
 */
const CFG: Record<Mode, { pitch: number; incs: number[]; raans: number[]; rolls: number[] }> = {
  cockpit: { pitch: 0.38, incs: [0.95, 0.42, 1.28, 0.7, 1.12], raans: [0.35, 2.3, 4.2, 1.2, 3.3], rolls: [0, 0, 0, 0, 0] },
  horizon: { pitch: -0.26, incs: [1.72, 1.64, 1.8, 1.68, 1.76], raans: [0.22, -0.18, 0.08, 0.3, -0.26], rolls: [0.16, -0.2, 0.05, 0.26, -0.1] },
};
/** horizon 的卫星统一慢速（背景氛围），相位均匀错开，保证任何时刻地平线上至少有一颗 */
const HORIZON_SPEED = 0.05;
/** 让东经约 108° 朝向观察者 */
const START_SPIN = -Math.PI / 2 - (108 * Math.PI) / 180 + Math.PI * 2;
const STATION = lonLatToXyz(116.4, 39.9);
const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';

const mix = (a: RGBA, b: RGBA, t: number): RGBA => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, 1];
const rgba = (c: RGBA, a: number) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;

function orbitPoint(o: Orbit, th: number): Vec3 {
  const x = o.r * Math.cos(th);
  const y = o.r * Math.sin(th) * Math.sin(o.inc);
  const z = -o.r * Math.sin(th) * Math.cos(o.inc);
  const cr = Math.cos(o.raan), sr = Math.sin(o.raan);
  const x2 = x * cr + z * sr, z2 = -x * sr + z * cr;
  if (!o.roll) return [x2, y, z2];
  const cl = Math.cos(o.roll), sl = Math.sin(o.roll);
  return [x2 * cl - y * sl, x2 * sl + y * cl, z2];
}

function rotate(p: Vec3, yaw: number, pitch: number): Vec3 {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const x1 = p[0] * cy + p[2] * sy, z1 = -p[0] * sy + p[2] * cy;
  return [x1, p[1] * cp - z1 * sp, p[1] * sp + z1 * cp];
}

/** 画布里的地球位置与半径 */
function geometry(mode: Mode, w: number, h: number) {
  if (mode === 'cockpit') {
    const R = Math.max(36, Math.min(w, h) / 2 / 1.52);
    return { R, cx: w / 2, cy: h / 2 - R * 0.05, capH: 0 };
  }
  // 地平线：只露上半部分。可见球冠高度不超过容器的 72%，上方留给越过地平线的轨道弧
  const capH = Math.min(h * 0.62, Math.max(170, w * 0.28));
  const R = Math.max(w * 0.46, capH * 1.4);
  return { R, cx: w / 2, cy: h - capH + R, capH };
}

/** horizon：容器很宽或很矮时，把轨道半径往地球收一收，保证最外圈弧顶不出画面 */
function fitOrbits(os: Orbit[], mode: Mode, w: number, h: number): Orbit[] {
  if (mode !== 'horizon' || !os.length) return os;
  const { R, capH } = geometry(mode, w, h);
  const rMax = Math.max(...os.map(o => o.r));
  const k = clamp((h - capH - 22) / (R * (rMax - 1) || 1), 0.35, 1);
  return k >= 1 ? os : os.map(o => ({ ...o, r: 1 + (o.r - 1) * k }));
}

/** 按模式和地球像素半径挑采样密度：cockpit 点距约 4–5px；horizon 是大背景，点距放宽到约 11–13px，显得通透 */
const samplesFor = (mode: Mode, R: number) => (mode === 'horizon' ? (R < 420 ? 26000 : 36000) : R < 190 ? 16000 : R < 280 ? 26000 : 40000);

/**
 * 点阵地球 + 型号轨道（Canvas 2D）。由方案 A 的 Globe 移植改造：
 * - mode="cockpit"：完整地球居中，外圈 HUD 航向刻度环，下方柔和投影；
 * - mode="horizon"：大地球只露上半，像一道地平线，轨道弧越过地平线；
 * - 浅色无雾：只有 1px 圆盘描边 + 下方投影；点阵用墨色，按深度取 α .2–.7（深色模式保留一圈淡 accent 外光）；
 * - 卫星数量 = satellites.length；selected 放大加光环，其余降透明度；点卫星 onSelect(id)，再点一次或点空白 onSelect(null)；
 * - 可拖拽旋转，松手带惯性；悬停卫星出卡片；
 * - fx.intensity 为 0 时不自转、卫星静止，只在拖拽和状态变化时重绘。
 * children 会叠在地球正中（例如巨型完成率），不拦截鼠标。
 */
export function Globe({ mode, satellites, selected = null, onSelect, className = '', hud = mode === 'cockpit', children }: {
  mode: Mode;
  satellites: Satellite[];
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  className?: string;
  /** cockpit 默认显示左下角航向读数与右下角轨道数 */
  hud?: boolean;
  children?: ReactNode;
}) {
  const { fx, isDark, accent } = useSite();
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const hdg = useRef<HTMLSpanElement>(null);
  const size = useBox(wrap);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const cardId = hoverId ?? focusId;

  const geo = geometry(mode, size.width, size.height);
  const samples = samplesFor(mode, geo.R);
  const dots = useMemo(() => landDots(samples), [samples]);
  const buckets = useMemo(() => Array.from({ length: 6 }, () => new Float32Array((dots.length / 3) * 2)), [dots]);

  const satKey = satellites.map(s => `${s.id}:${s.size}`).join('|');
  const orbits: Orbit[] = useMemo(() => {
    const n = satellites.length;
    const maxSize = Math.max(1e-9, ...satellites.map(s => Math.abs(s.size)));
    const cfg = CFG[mode];
    const r0 = mode === 'cockpit' ? 1.16 : 1.14;
    const step = mode === 'cockpit' ? Math.min(0.1, 0.26 / Math.max(1, n - 1)) : Math.min(0.055, 0.16 / Math.max(1, n - 1));
    return satellites.map((s, i) => {
      const share = clamp(Math.abs(s.size) / maxSize, 0.15, 1);
      return {
        id: s.id, r: r0 + i * step, inc: cfg.incs[i % 5], raan: cfg.raans[i % 5] + Math.floor(i / 5) * 0.6, roll: cfg.rolls[i % 5],
        speed: mode === 'horizon' ? HORIZON_SPEED : 0.1 + 0.22 * share, size: 3 + 2.6 * share,
      };
    });
  }, [satKey, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const st = useRef({
    spin: START_SPIN, camYaw: 0, pitch: CFG[mode].pitch, vYaw: 0, t: 0,
    dragging: false, lastX: 0, lastY: 0, lastT: 0, moved: 0, pointerId: -1,
    w: 0, h: 0, ratio: 1, pal: null as Palette | null, sats: [] as SatScreen[],
    phases: new Map<string, number>(), arcs: new Map<string, { b: number; span: number }>(), phaseKey: '',
    selected: null as string | null, card: null as string | null, focus: null as string | null, frame: 0,
  });
  const fxRef = useRef(fx);
  fxRef.current = fx;
  const orbitsRef = useRef(orbits);
  orbitsRef.current = orbits;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  st.current.selected = selected;
  st.current.card = cardId;
  st.current.focus = focusId;

  /**
   * 卫星起始相位：
   * - cockpit：每颗挑轨道上可见、彼此离得最远的一点（fx 关闭时就停在这里；开启时从这里出发）；
   * - horizon：先求每条轨道露在地平线上的那段弧（两端落在画布底部的渐隐区以下），
   *   卫星只沿这段弧从左往右走，走到头在画面外回到起点；起始时在各自弧上均匀错开，任何时刻都看得到。
   */
  const placeSatellites = useCallback((cx: number, cy: number, R: number) => {
    const s = st.current, md = modeRef.current, os = fitOrbits(orbitsRef.current, md, s.w, s.h);
    const key = `${md}|${Math.round(s.w)}|${Math.round(s.h)}|${os.map(o => o.id).join(',')}`;
    if (s.phaseKey === key) return;
    s.phaseKey = key;
    if (md === 'horizon') {
      const pitch = CFG.horizon.pitch, N = 360;
      os.forEach((o, i) => {
        const ys: number[] = [];
        let top = 0;
        for (let j = 0; j < N; j++) {
          const q = rotate(orbitPoint(o, (j / N) * Math.PI * 2), 0, pitch);
          ys.push(cy - q[1] * R);
          if (ys[j] < ys[top]) top = j;
        }
        const limit = s.h + 24;
        let a = top, b = top;
        while (b - top < N - 1 && ys[(b + 1) % N] < limit) b++;
        while (top - a < N - 1 - (b - top) && ys[(a - 1 + N) % N] < limit) a--;
        const th = (j: number) => (j / N) * Math.PI * 2;
        const span = Math.max(0.2, th(b - a) + 0.12);
        s.arcs.set(o.id, { b: th(b) + 0.06, span });
        s.phases.set(o.id, span * ((i + 0.5) / Math.max(1, os.length)) * 0.92 + span * 0.04 - s.t * o.speed);
      });
      return;
    }
    const placed: { x: number; y: number }[] = [];
    const mx = Math.max(30, s.w * 0.12), my = Math.max(30, s.h * 0.12);
    os.forEach((o, i) => {
      let best = (i * 2.1) % (Math.PI * 2), bestScore = -Infinity;
      for (let j = 0; j < 96; j++) {
        const th = (j / 96) * Math.PI * 2;
        const q = rotate(orbitPoint(o, th), s.camYaw, s.pitch);
        const x = cx + q[0] * R, y = cy - q[1] * R;
        const hidden = q[2] < 0 && q[0] * q[0] + q[1] * q[1] < 1;
        if (hidden || x < mx || x > s.w - mx * 1.4 || y < my || y > s.h - my) continue;
        const d = placed.length ? Math.min(...placed.map(p => Math.hypot(p.x - x, p.y - y))) : 200;
        const score = Math.min(d, R * 0.9) + (q[2] > 0 ? R * 0.25 : 0) - Math.hypot(x - cx, y - cy) * 0.15;
        if (score > bestScore) { bestScore = score; best = th; }
      }
      s.phases.set(o.id, best - s.t * o.speed);
      const q = rotate(orbitPoint(o, best), s.camYaw, s.pitch);
      placed.push({ x: cx + q[0] * R, y: cy - q[1] * R });
    });
  }, []);

  const draw = useCallback((_time: number, dt: number) => {
    const s = st.current, cv = canvas.current, pal = s.pal;
    if (!cv || !pal || !s.w || !s.h) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const f = fxRef.current, k = f.intensity, md = modeRef.current, base = CFG[md].pitch;
    if (f.motion) {
      if (!s.dragging) {
        s.camYaw += s.vYaw * dt;
        s.vYaw *= Math.exp(-dt * 2.2);
        s.pitch += (base - s.pitch) * (1 - Math.exp(-dt * 0.9));
      }
      s.spin += dt * 0.055 * k;
      s.t += dt * k;
    }
    const { w, h, ratio } = s;
    const { R, cx, cy } = geometry(md, w, h);
    placeSatellites(cx, cy, R);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const ink = pal.ink, dark = pal.dark;

    // 下方柔和投影（cockpit）/ 深色模式的淡外光
    if (md === 'cockpit' && !dark) {
      const sy = cy + R * 1.13, rx = R * 0.82, ry = R * 0.1;
      ctx.save();
      ctx.translate(cx, sy); ctx.scale(1, ry / rx);
      const sh = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      sh.addColorStop(0, rgba(ink, 0.13)); sh.addColorStop(0.55, rgba(ink, 0.05)); sh.addColorStop(1, rgba(ink, 0));
      ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (dark) {
      const glow = ctx.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.14);
      glow.addColorStop(0, rgba(pal.accent, 0.14)); glow.addColorStop(1, rgba(pal.accent, 0));
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, R * 1.14, 0, Math.PI * 2); ctx.fill();
    }

    const camYaw = s.camYaw, pitch = s.pitch;
    // horizon 的轨道相对相机固定（拖拽只转地球），保证卫星在画面外回到起点
    const oYaw = md === 'horizon' ? 0 : camYaw, oPitch = md === 'horizon' ? base : pitch;
    const proj = (p: Vec3) => {
      const q = rotate(p, oYaw, oPitch);
      return { x: cx + q[0] * R, y: cy - q[1] * R, z: q[2], hidden: q[2] < 0 && q[0] * q[0] + q[1] * q[1] < 1, q };
    };
    const os = fitOrbits(orbitsRef.current, md, w, h);
    const active = s.selected && os.some(o => o.id === s.selected) ? s.selected : null;

    // 轨道背面（被地球挡住的部分），先画，随后被球体盖住一半
    const paths = os.map(o => {
      const front = new Path2D(), back = new Path2D();
      let penF = false, penB = false;
      const N = 180;
      for (let j = 0; j <= N; j++) {
        const p = proj(orbitPoint(o, (j / N) * Math.PI * 2));
        if (p.hidden) { penF = false; if (penB) back.lineTo(p.x, p.y); else { back.moveTo(p.x, p.y); penB = true; } }
        else { penB = false; if (penF) front.lineTo(p.x, p.y); else { front.moveTo(p.x, p.y); penF = true; } }
      }
      return { front, back };
    });

    // 球体：面板色实底 + 极淡的体积明暗（只在圆盘内），1px 描边
    // canvas 渐变按非预乘插值：白 → 半透明墨色中间会发灰，所以终点用预先混好的不透明色
    const shade = mix(pal.surface, dark ? pal.accent : ink, dark ? 0.06 : 0.035);
    const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R);
    body.addColorStop(0, rgba(pal.surface, 1));
    body.addColorStop(0.72, rgba(pal.surface, 1));
    body.addColorStop(1, rgba(shade, 1));
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(ink, dark ? 0.2 : 0.14);
    ctx.stroke();
    if (md === 'horizon') {
      // 地平线上沿一道很细的主色高光线（线，不是光晕）
      const g = ctx.createLinearGradient(cx - R * 0.8, 0, cx + R * 0.8, 0);
      g.addColorStop(0, rgba(pal.accent, 0)); g.addColorStop(0.5, rgba(pal.accent, dark ? 0.75 : 0.55)); g.addColorStop(1, rgba(pal.accent, 0));
      ctx.strokeStyle = g; ctx.lineWidth = 1.25;
      ctx.beginPath(); ctx.arc(cx, cy, R + 0.5, Math.PI * 1.18, Math.PI * 1.82); ctx.stroke();
    }

    // 经纬网（随地球自转）。horizon 是欢迎页的大背景，不画经纬网、背面轨道和测控链路，只留点阵、轨道和卫星，画面干净
    const hz = md === 'horizon';
    const yaw = s.spin + camYaw;
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(ink, dark ? 0.08 : 0.055);
    ctx.beginPath();
    const gp = (lon: number, lat: number) => rotate(lonLatToXyz(lon, lat), yaw, pitch);
    if (!hz) for (let lon = -180; lon < 180; lon += 30) {
      let pen = false;
      for (let lat = -84; lat <= 84; lat += 6) {
        const q = gp(lon, lat);
        if (q[2] <= 0.02) { pen = false; continue; }
        const x = cx + q[0] * R, y = cy - q[1] * R;
        if (pen) ctx.lineTo(x, y); else { ctx.moveTo(x, y); pen = true; }
      }
    }
    if (!hz) for (let lat = -60; lat <= 60; lat += 30) {
      let pen = false;
      for (let lon = -180; lon <= 180; lon += 5) {
        const q = gp(lon, lat);
        if (q[2] <= 0.02) { pen = false; continue; }
        const x = cx + q[0] * R, y = cy - q[1] * R;
        if (pen) ctx.lineTo(x, y); else { ctx.moveTo(x, y); pen = true; }
      }
    }
    ctx.stroke();

    // 背面轨道（虚线，压在球面上很淡）
    ctx.setLineDash([2, 5]);
    if (!hz) os.forEach((o, i) => {
      const col = pal.sats.get(o.id) ?? pal.accent;
      const dim = active && active !== o.id;
      ctx.strokeStyle = rgba(col, dim ? 0.05 : 0.16);
      ctx.lineWidth = 1;
      ctx.stroke(paths[i].back);
    });
    ctx.setLineDash([]);

    // 点阵：只画朝向观察者的陆地点，按深度分 6 档（α .2–.7）
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const counts = [0, 0, 0, 0, 0, 0];
    const yMax = h + 2;
    for (let i = 0; i < dots.length; i += 3) {
      const x = dots[i], y = dots[i + 1], z = dots[i + 2];
      const x1 = x * cyw + z * syw, z1 = -x * syw + z * cyw;
      const z2 = y * sp + z1 * cp;
      if (z2 <= 0.04) continue;
      const y2 = y * cp - z1 * sp;
      const py = cy - y2 * R;
      if (py > yMax) continue;
      const b = z2 < 0.12 ? 0 : z2 < 0.3 ? 1 : z2 < 0.5 ? 2 : z2 < 0.7 ? 3 : z2 < 0.88 ? 4 : 5;
      const buf = buckets[b];
      buf[counts[b]++] = cx + x1 * R;
      buf[counts[b]++] = py;
    }
    const dotScale = md === 'horizon' ? 1.45 : clamp(R / 170, 0.8, 1.25);
    // 深度越浅（靠近边缘）点越小越淡：边缘处点被透视压扁、挤在一起，不缩小会连成一片灰
    const alphas = dark ? [0.1, 0.18, 0.28, 0.4, 0.52, 0.62] : [0.12, 0.2, 0.32, 0.45, 0.58, 0.7];
    const radii = [0.51, 0.65, 0.76, 0.85, 0.93, 0.98];
    for (let b = 0; b < 6; b++) {
      const buf = buckets[b], n = counts[b];
      if (!n) continue;
      const r = radii[b] * dotScale;
      ctx.fillStyle = rgba(ink, alphas[b]);
      ctx.beginPath();
      for (let i = 0; i < n; i += 2) { ctx.moveTo(buf[i] + r, buf[i + 1]); ctx.arc(buf[i], buf[i + 1], r, 0, Math.PI * 2); }
      ctx.fill();
    }

    // 测控站（北京）
    const stq = rotate(STATION, yaw, pitch);
    const station = { x: cx + stq[0] * R, y: cy - stq[1] * R, front: !hz && stq[2] > 0.06 && cy - stq[1] * R < h - 4 };

    // 前半轨道、尾迹、卫星
    const sats: SatScreen[] = [];
    ctx.lineCap = 'round';
    os.forEach((o, i) => {
      const col = pal.sats.get(o.id) ?? pal.accent;
      const on = active === o.id;
      const dim = !!active && !on;
      ctx.lineWidth = on ? 1.5 : 1;
      ctx.strokeStyle = rgba(col, dim ? 0.12 : on ? 0.85 : hz ? 0.16 : 0.4);
      ctx.stroke(paths[i].front);

      const ph = (s.phases.get(o.id) ?? 0) + s.t * o.speed;
      const arc = md === 'horizon' ? s.arcs.get(o.id) : undefined;
      const th = arc ? arc.b - (((ph % arc.span) + arc.span) % arc.span) : ph;
      const dir = arc ? -1 : 1;
      // 尾迹：沿运动反方向往回 0.62 弧度，逐段加粗加深
      const segs = 22, span = 0.62;
      let prev = proj(orbitPoint(o, th - dir * span));
      for (let j = 1; j <= segs; j++) {
        const p = proj(orbitPoint(o, th - dir * span * (1 - j / segs)));
        if (!p.hidden && !prev.hidden) {
          ctx.strokeStyle = rgba(col, (j / segs) * (dim ? 0.18 : 0.8));
          ctx.lineWidth = 0.8 + (j / segs) * 1.6;
          ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); ctx.stroke();
        }
        prev = p;
      }
      const p3 = orbitPoint(o, th);
      const p = proj(p3);
      const r = o.size * (on ? 1.35 : 1);
      sats.push({ id: o.id, x: p.x, y: p.y, r, front: !p.hidden });
      const a = p.hidden ? 0.28 : dim ? 0.35 : 1;

      // 测控链路：卫星在测控站地平线以上时连一条流动虚线
      if (station.front && !p.hidden) {
        const dx = p.q[0] - stq[0], dy = p.q[1] - stq[1], dz = p.q[2] - stq[2];
        if (dx * stq[0] + dy * stq[1] + dz * stq[2] > 0.05) {
          ctx.setLineDash([3, 4]);
          ctx.lineDashOffset = -s.t * 16;
          ctx.strokeStyle = rgba(col, dim ? 0.1 : on ? 0.6 : 0.36);
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(station.x, station.y); ctx.lineTo(p.x, p.y); ctx.stroke();
          ctx.setLineDash([]);
          ctx.lineDashOffset = 0;
        }
      }

      // 选中：外圈光环 + 一圈向外扩散的脉冲（有动效时）
      if (on && !p.hidden) {
        ctx.strokeStyle = rgba(col, 0.9);
        ctx.lineWidth = 1.25;
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 6, 0, Math.PI * 2); ctx.stroke();
        if (f.motion) {
          const ph = (s.t * 0.7) % 1;
          ctx.strokeStyle = rgba(col, 0.5 * (1 - ph));
          ctx.beginPath(); ctx.arc(p.x, p.y, r + 6 + ph * 14, 0, Math.PI * 2); ctx.stroke();
        } else {
          ctx.fillStyle = rgba(col, 0.1);
          ctx.beginPath(); ctx.arc(p.x, p.y, r + 12, 0, Math.PI * 2); ctx.fill();
        }
      } else if ((s.card === o.id) && !p.hidden) {
        ctx.strokeStyle = rgba(col, 0.55);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 5, 0, Math.PI * 2); ctx.stroke();
      }
      // 键盘焦点：2px 主色环
      if (s.focus === o.id) {
        ctx.strokeStyle = rgba(pal.accent, 1);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 9, 0, Math.PI * 2); ctx.stroke();
      }
      // 实心点 + 2px 表面色描边
      ctx.fillStyle = rgba(pal.surface, p.hidden ? 0.5 : 1);
      ctx.beginPath(); ctx.arc(p.x, p.y, r + 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgba(col, a);
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();

      if (!p.hidden) {
        ctx.font = `${on ? 600 : 500} ${on ? 12 : 11}px ${MONO}`;
        const lx = p.x + r + 7, ly = p.y - r - 3;
        ctx.lineJoin = 'round';
        ctx.lineWidth = 3;
        ctx.strokeStyle = rgba(pal.surface, dim ? 0.5 : 0.9);
        ctx.strokeText(o.id, lx, ly);
        ctx.fillStyle = rgba(ink, dim ? 0.35 : on ? 0.95 : 0.72);
        ctx.fillText(o.id, lx, ly);
      }
    });

    if (station.front) {
      const pulse = f.motion ? (s.t * 0.55) % 1 : 0.55;
      ctx.strokeStyle = rgba(pal.signal, 0.7 * (1 - pulse));
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(station.x, station.y, 4 + pulse * 12, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = rgba(pal.signal, 1);
      ctx.beginPath();
      ctx.moveTo(station.x, station.y - 3.5); ctx.lineTo(station.x + 3.5, station.y); ctx.lineTo(station.x, station.y + 3.5); ctx.lineTo(station.x - 3.5, station.y);
      ctx.closePath(); ctx.fill();
    }
    s.sats = sats;

    // HUD 航向刻度环（cockpit）：随航向转动，顶部固定一个指针
    if (md === 'cockpit') {
      const ringR = Math.min(R * 1.46, Math.min(w, h) / 2 - 6);
      const heading = -yaw;
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(ink, dark ? 0.12 : 0.09);
      ctx.beginPath(); ctx.arc(cx, cy, ringR, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 72; i++) {
        if (i % 6 === 0) continue;
        const a = heading + (i / 72) * Math.PI * 2;
        ctx.moveTo(cx + Math.sin(a) * ringR, cy - Math.cos(a) * ringR);
        ctx.lineTo(cx + Math.sin(a) * (ringR - 3), cy - Math.cos(a) * (ringR - 3));
      }
      ctx.strokeStyle = rgba(ink, dark ? 0.18 : 0.14);
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const a = heading + (i / 12) * Math.PI * 2;
        ctx.moveTo(cx + Math.sin(a) * ringR, cy - Math.cos(a) * ringR);
        ctx.lineTo(cx + Math.sin(a) * (ringR - 7), cy - Math.cos(a) * (ringR - 7));
      }
      ctx.strokeStyle = rgba(ink, dark ? 0.34 : 0.3);
      ctx.stroke();
      ctx.font = `500 10px ${MONO}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = rgba(ink, dark ? 0.5 : 0.42);
      for (let i = 0; i < 4; i++) {
        const a = heading + (i / 4) * Math.PI * 2;
        ctx.fillText(String(i * 90).padStart(3, '0'), cx + Math.sin(a) * (ringR - 16), cy - Math.cos(a) * (ringR - 16));
      }
      ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
      // 顶部指针
      ctx.fillStyle = rgba(pal.accent, 0.9);
      ctx.beginPath(); ctx.moveTo(cx, cy - ringR - 1); ctx.lineTo(cx - 4, cy - ringR - 8); ctx.lineTo(cx + 4, cy - ringR - 8); ctx.closePath(); ctx.fill();
    }

    // 卡片跟随卫星
    const el = card.current;
    if (el && s.card) {
      const sat = sats.find(x => x.id === s.card);
      if (sat) {
        const cw = el.offsetWidth || 220, ch = el.offsetHeight || 120;
        const flip = sat.x + 18 + cw > w - 8;
        let tx = flip ? sat.x - 18 - cw : sat.x + 18;
        tx = clamp(tx, 4, Math.max(4, w - cw - 4));
        const ty = clamp(sat.y - ch / 2, 4, Math.max(4, h - ch - 4));
        el.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0)`;
      }
    }
    s.frame++;
    if (hdg.current && (s.frame % 6 === 1 || !f.motion)) {
      const deg = ((((-yaw * 180) / Math.PI) % 360) + 360) % 360;
      hdg.current.textContent = `${deg.toFixed(1).padStart(5, '0')}°`;
    }
  }, [dots, buckets, placeSatellites]);

  // 关闭特效时按需重绘
  const rafOnce = useRef(0);
  const requestDraw = useCallback(() => {
    if (fxRef.current.motion) return;
    cancelAnimationFrame(rafOnce.current);
    rafOnce.current = requestAnimationFrame(() => draw(0, 0));
  }, [draw]);
  useEffect(() => () => cancelAnimationFrame(rafOnce.current), []);

  // 颜色：token 与卫星色都经由一个隐藏元素解析（支持 var()、color-mix）
  const colorKey = satellites.map(s => `${s.id}=${s.color}`).join('|');
  const readPalette = useCallback(() => {
    const el = probe.current;
    const res = (c: string): RGBA => {
      if (!el) return colorToRgba(c);
      el.style.color = '';
      el.style.color = c;
      return colorToRgba(getComputedStyle(el).color || c);
    };
    const sats = new Map<string, RGBA>();
    satellites.forEach(s => sats.set(s.id, res(s.color)));
    st.current.pal = {
      ink: res('var(--vd-ink-1, #0E1320)'), surface: res('var(--vd-panel, #FFFFFF)'),
      signal: res('var(--vd-signal, #E2621B)'), accent: res('var(--accent, #2F6BFF)'), sats, dark: isDark,
    };
  }, [colorKey, isDark]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    readPalette();
    requestDraw();
    // token 样式表可能晚一帧到位；明暗、主色切换时 <html> 的属性会变
    const raf = requestAnimationFrame(() => { readPalette(); requestDraw(); });
    const mo = new MutationObserver(() => { readPalette(); requestDraw(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style', 'data-variant'] });
    return () => { cancelAnimationFrame(raf); mo.disconnect(); };
  }, [readPalette, accent.hex, requestDraw]);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !size.width || !size.height) return;
    const ratio = dpr(2);
    cv.width = Math.round(size.width * ratio);
    cv.height = Math.round(size.height * ratio);
    Object.assign(st.current, { w: size.width, h: size.height, ratio });
    draw(0, 0);
  }, [size.width, size.height, draw]);

  useEffect(() => { st.current.pitch = CFG[mode].pitch; st.current.phaseKey = ''; requestDraw(); }, [mode, requestDraw]);
  useEffect(() => { st.current.phaseKey = ''; requestDraw(); }, [orbits, requestDraw]);
  useEffect(() => { requestDraw(); }, [cardId, focusId, selected, fx.motion, requestDraw]);

  // horizon 是背景，30fps 足够；cockpit 60fps
  useRafLoop(draw, { active: fx.motion, target: wrap, fps: mode === 'horizon' ? 30 : 60 });

  const hit = (x: number, y: number) => {
    let best: string | null = null, dist = 20;
    for (const sat of st.current.sats) {
      if (!sat.front) continue;
      const d = Math.hypot(sat.x - x, sat.y - y) - sat.r;
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
      const sens = modeRef.current === 'horizon' ? 0.0026 : 0.0065;
      s.camYaw += dx * sens;
      s.pitch = modeRef.current === 'horizon' ? clamp(s.pitch + dy * 0.0015, 0.02, 0.4) : clamp(s.pitch + dy * 0.004, -0.2, 0.95);
      s.vYaw = s.vYaw * 0.6 + ((dx * sens) / dts) * 0.4;
      s.lastX = e.clientX; s.lastY = e.clientY; s.lastT = now;
      s.moved += Math.abs(dx) + Math.abs(dy);
      if (s.moved > 4) { e.currentTarget.style.cursor = 'grabbing'; if (hoverId) setHoverId(null); }
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
    s.vYaw = clamp(s.vYaw, -3, 3);
    if (!fxRef.current.motion) s.vYaw = 0;
    if (s.moved < 6) {
      const p = local(e);
      const id = hit(p.x, p.y);
      if (e.pointerType !== 'mouse') setHoverId(id);
      if (onSelect) onSelect(id && id !== selected ? id : null);
    }
  };

  const shown = satellites.find(s => s.id === cardId) ?? null;
  const summary = satellites.map(s => `${s.label} ${s.value}`).join('，');
  const ariaLabel = `${mode === 'cockpit' ? '点阵地球' : '地平线点阵地球'}与 ${satellites.length} 条型号轨道，卫星大小对应数值：${summary}。可拖拽旋转。`;

  return (
    <div className={`vd-globe is-${mode} ${className}`}>
      <div ref={wrap} className="vd-globe-stage">
        <span ref={probe} hidden />
        <canvas ref={canvas} className="vd-globe-canvas" role="img" aria-label={ariaLabel}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          onPointerLeave={e => { if (e.pointerType === 'mouse' && !st.current.dragging) setHoverId(null); }} />
        {children && <div className="vd-globe-overlay">{children}</div>}
        {hud && (
          <>
            <div className="vd-globe-hud is-bl" aria-hidden="true"><span>HDG</span><b ref={hdg}>000.0°</b></div>
            <div className="vd-globe-hud is-br" aria-hidden="true"><span>ORBITS</span><b>{String(satellites.length).padStart(2, '0')}</b></div>
          </>
        )}
        <div ref={card} className={`vd-globe-card${shown ? ' is-on' : ''}`} aria-hidden={!shown}>
          {shown && (
            <>
              <p className="vd-globe-card-h">
                <i style={{ background: shown.color }} />
                <b>{shown.label}</b>
                {shown.label !== shown.id && <span>{shown.id}</span>}
              </p>
              <p className="vd-globe-card-v">{shown.value}</p>
              {shown.rows && shown.rows.length > 0 && (
                <dl>{shown.rows.map(r => <div key={r.label}><dt>{r.label}</dt><dd>{r.value}</dd></div>)}</dl>
              )}
              {shown.progress !== undefined && (
                <span className="vd-globe-card-bar" aria-hidden="true"><i style={{ transform: `scaleX(${clamp(shown.progress)})`, background: shown.color } as CSSProperties} /></span>
              )}
              {onSelect && <p className="vd-globe-card-hint">{selected === shown.id ? '再点一次取消筛选' : '点击筛选到这个型号'}</p>}
            </>
          )}
        </div>
      </div>
      <ul className="vd-viz-sr" aria-label="型号卫星">
        {satellites.map(s => (
          <li key={s.id}>
            <button type="button" aria-pressed={onSelect ? selected === s.id : undefined}
              onFocus={() => setFocusId(s.id)} onBlur={() => setFocusId(null)}
              onClick={() => onSelect?.(selected === s.id ? null : s.id)}>
              {s.label}：{s.value}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
