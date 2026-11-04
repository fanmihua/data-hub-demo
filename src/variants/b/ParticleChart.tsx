import { useEffect, useMemo, useRef, useState } from 'react';
import { colorToRgba, cssVar, dpr, useElementSize, useInView, useRafLoop } from '../../core/fx/hooks';
import { useSite } from '../../core/provider';
import { niceMax, scaleBand, scaleLinear } from '../../core/charts/scale';
import { wan, wanLabel } from '../../core/data/format';
import { Tip, TipRow, useKeyNav, useOutsideClear } from './charts/common';
import { useModelColor } from './lib';

/**
 * 粒子成图：散落的粒子在段落进入视口时飞到各自位置，拼成「型号 × 月份」的收入柱状图。
 * - 粒子数按特效强度取（完整约 5200，轻量约 2600），每根柱子按网格采样目标点；
 * - 飞行：缓出 + 垂直于路径的轻微回旋，按柱子顺序和自下而上的行序错开；
 * - 落定后停止 rAF，只在悬停变化时重画一帧；离开视口、标签页隐藏时暂停；
 * - 关闭特效时直接画终态。坐标轴、网格和悬停热区用 SVG 叠在画布上，保证文字清晰、可键盘访问。
 */

interface Bar { gi: number; si: number; model: string; month: string; label: string; value: number; x: number; y: number; w: number; h: number }
interface Sim {
  n: number;
  tx: Float32Array; ty: Float32Array; sx: Float32Array; sy: Float32Array;
  delay: Float32Array; seed: Float32Array; bar: Uint16Array; color: Uint8Array;
  size: number;
  time: number;
  revealAt: number;
  settled: boolean;
  span: number;
}

const DUR = 1.25;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);

export function ParticleChart({ height }: { height: number }) {
  const { derived: d, fx, isDark, accent } = useSite();
  const colorOf = useModelColor();
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const { width } = useElementSize(wrap);
  const inView = useInView(wrap, { threshold: 0.35, rootMargin: '0px' });
  const [hover, setHover] = useState<number | null>(null);
  const [running, setRunning] = useState(fx.motion);
  const sim = useRef<Sim | null>(null);
  const palette = useRef<string[]>([]);
  useOutsideClear(wrap, hover !== null, () => setHover(null));

  const m = { l: 48, r: 8, t: 18, b: 30 };
  const w = Math.max(200, width), h = height;
  const layout = useMemo(() => {
    const months = d.monthlyRevenue.map(x => x.month);
    const max = niceMax(Math.max(1, ...d.monthlyRevenue.flatMap(x => Object.values(x.byModel))), 4);
    const y = scaleLinear([0, max], [h - m.b, m.t]);
    const band = scaleBand(months, [m.l, w - m.r], 0.26);
    const ns = Math.max(1, d.models.length), gap = 4;
    const bw = Math.max(3, Math.min(24, (band.bandwidth - gap * (ns - 1)) / ns));
    const gw = bw * ns + gap * (ns - 1);
    const bars: Bar[] = [];
    d.monthlyRevenue.forEach((pt, gi) => d.models.forEach((mo, si) => {
      const v = pt.byModel[mo.id] ?? 0;
      bars.push({ gi, si, model: mo.id, month: pt.month, label: pt.label, value: v, x: band(pt.month) + (band.bandwidth - gw) / 2 + si * (bw + gap), y: y(v), w: bw, h: h - m.b - y(v) });
    }));
    return { y, band, bars, bw, gap, ticks: y.ticks(4) };
  }, [d, w, h]); // eslint-disable-line react-hooks/exhaustive-deps

  // 生成粒子
  useEffect(() => {
    if (!width) return;
    const { bars } = layout;
    const area = bars.reduce((s, b) => s + b.w * b.h, 0) || 1;
    const want = fx.intensity >= 1 ? 5200 : 2600;
    const sp = Math.max(2.4, Math.min(6, Math.sqrt(area / want)));
    const pts: { x: number; y: number; bar: number; row: number; color: number }[] = [];
    bars.forEach((b, bi) => {
      const cols = Math.max(2, Math.round(b.w / sp)), rows = Math.max(1, Math.round(b.h / sp));
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) pts.push({ x: b.x + ((c + 0.5) * b.w) / cols, y: b.y + b.h - ((r + 0.5) * b.h) / rows, bar: bi, row: r, color: b.si });
    });
    const n = pts.length;
    const s: Sim = {
      n, tx: new Float32Array(n), ty: new Float32Array(n), sx: new Float32Array(n), sy: new Float32Array(n),
      delay: new Float32Array(n), seed: new Float32Array(n), bar: new Uint16Array(n), color: new Uint8Array(n),
      size: Math.max(1, Math.min(1.7, sp * 0.36)), time: sim.current?.time ?? 0,
      revealAt: sim.current?.revealAt ?? -1, settled: (sim.current?.settled ?? false) || !fx.motion, span: 0,
    };
    let rnd = 1234567;
    const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
    const cx = w / 2, cy = h * 0.46;
    pts.forEach((p, i) => {
      s.tx[i] = p.x; s.ty[i] = p.y; s.bar[i] = p.bar; s.color[i] = p.color;
      const a = rand() * Math.PI * 2, rr = Math.sqrt(rand());
      s.sx[i] = cx + Math.cos(a) * rr * w * 0.48;
      s.sy[i] = cy + Math.sin(a) * rr * h * 0.42;
      s.seed[i] = rand();
      const b = bars[p.bar];
      s.delay[i] = b.gi * 0.07 + b.si * 0.025 + p.row * 0.006 + rand() * 0.28;
      s.span = Math.max(s.span, s.delay[i] + DUR);
    });
    sim.current = s;
    const c = cv.current;
    if (c) { const k = dpr(2); c.width = Math.round(w * k); c.height = Math.round(h * k); }
    setRunning(fx.motion && !s.settled);
    draw();
  }, [layout, fx.intensity]); // eslint-disable-line react-hooks/exhaustive-deps

  // 颜色跟随主题
  useEffect(() => {
    const el = wrap.current ?? document.documentElement;
    palette.current = d.models.map((mo) => {
      const v = colorOf(mo.id).match(/--[\w-]+/)?.[0];
      const [r, g, b] = colorToRgba(v ? cssVar(v, el) : accent.hex);
      return `${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)}`;
    });
    draw();
  }, [accent.hex, isDark, d.models.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // 进入视口：开始聚合
  useEffect(() => {
    const s = sim.current;
    if (!s || !inView) return;
    if (!fx.motion) { s.settled = true; draw(); return; }
    if (s.revealAt < 0) { s.revealAt = s.time; setRunning(true); }
  }, [inView, fx.motion, width]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { draw(); }, [hover]); // eslint-disable-line react-hooks/exhaustive-deps

  function draw() {
    const s = sim.current, c = cv.current;
    if (!s || !c || !c.width || !palette.current.length) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const k = c.width / w;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const settleT = s.settled ? 1 : s.revealAt < 0 ? 0 : Math.max(0, Math.min(1, (s.time - s.revealAt - s.span + 0.5) / 0.5));
    // 落定后在粒子后面淡出实体柱，柱顶 4px 圆角
    if (settleT > 0) {
      layout.bars.forEach((b, i) => {
        if (b.h <= 0) return;
        const on = hover === null || hover === i;
        ctx.fillStyle = `rgba(${palette.current[b.si] ?? palette.current[0]},${(on ? 0.14 : 0.05) * settleT})`;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(b.x, b.y, b.w, b.h, [4, 4, 0, 0]); else ctx.rect(b.x, b.y, b.w, b.h);
        ctx.fill();
      });
    }
    const sz = s.size, t = s.time;
    for (let pass = 0; pass < 2; pass++) {
      for (let col = 0; col < palette.current.length; col++) {
        const alpha = hover === null ? (isDark ? 0.92 : 0.86) : pass === 0 ? 0.22 : 1;
        ctx.fillStyle = `rgba(${palette.current[col]},${alpha})`;
        ctx.beginPath();
        for (let i = 0; i < s.n; i++) {
          if (s.color[i] !== col) continue;
          const isHover = hover !== null && s.bar[i] === hover;
          if (hover !== null && (pass === 0) === isHover) continue;
          if (hover === null && pass === 1) continue;
          let x: number, y: number;
          if (s.settled) { x = s.tx[i]; y = s.ty[i]; }
          else {
            const drift = 5 * (1 - (s.revealAt < 0 ? 0 : 1));
            const lt = s.revealAt < 0 ? 0 : Math.max(0, Math.min(1, (t - s.revealAt - s.delay[i]) / DUR));
            const e = easeOut(lt);
            const ox = Math.sin(t * 0.7 + s.seed[i] * 6.283) * (6 + drift) * (1 - e);
            const oy = Math.cos(t * 0.55 + s.seed[i] * 9.1) * (6 + drift) * (1 - e);
            const dx = s.tx[i] - s.sx[i], dy = s.ty[i] - s.sy[i];
            const swirl = Math.sin(e * Math.PI) * (s.seed[i] - 0.5) * 60;
            const len = Math.hypot(dx, dy) || 1;
            x = s.sx[i] + dx * e - (dy / len) * swirl + ox;
            y = s.sy[i] + dy * e + (dx / len) * swirl + oy;
          }
          ctx.rect(x - sz, y - sz, sz * 2, sz * 2);
        }
        ctx.fill();
      }
    }
  }

  useRafLoop((_t, dt) => {
    const s = sim.current;
    if (!s) return;
    s.time += dt;
    if (s.revealAt >= 0 && s.time - s.revealAt > s.span + 0.5) { s.settled = true; draw(); setRunning(false); return; }
    draw();
  }, { active: running && fx.motion, target: wrap, fps: 60 });

  const onKey = useKeyNav(layout.bars.length, hover, setHover);
  const hb = hover !== null ? layout.bars[hover] : null;
  const summary = d.models.map(mo => `${mo.id} ${wanLabel(mo.monthly.reduce((a, b) => a + b, 0))}`).join('，');

  return (
    <div ref={wrap} className="vb-particles-fig" style={{ height }} role="group" tabIndex={0} onKeyDown={onKey} onBlur={() => setHover(null)}
      aria-label={`各型号月度收入柱状图，由粒子拼成。近 ${d.months.length} 个月合计：${summary}。用方向键逐根查看。`}>
      <canvas ref={cv} className="vb-particles-canvas" style={{ width: w, height: h }} aria-hidden="true" />
      {width > 0 && (
        <svg className="vb-particles-axis" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`各型号月度收入（万元）：${summary}`}
          onPointerLeave={e => { if (e.pointerType === 'mouse') setHover(null); }}>
          <g className="vb-grid">{layout.ticks.map(t => <line key={t} x1={m.l} x2={w - m.r} y1={layout.y(t)} y2={layout.y(t)} />)}</g>
          <g className="vb-axis">
            {layout.ticks.map(t => <text key={t} x={m.l - 8} y={layout.y(t)} dy="0.32em" textAnchor="end">{wan(t, 0)}</text>)}
            {d.monthlyRevenue.map((pt, i) => <text key={pt.month} x={layout.band(pt.month) + layout.band.bandwidth / 2} y={h - 8} textAnchor="middle" className={hb?.gi === i ? 'is-on' : undefined}>{pt.label}</text>)}
          </g>
          <line className="vb-baseline" x1={m.l} x2={w - m.r} y1={h - m.b} y2={h - m.b} />
          {layout.bars.map((b, i) => (
            <rect key={i} className="vb-hit" x={b.x - layout.gap / 2} y={m.t} width={b.w + layout.gap} height={h - m.b - m.t}
              onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} />
          ))}
        </svg>
      )}
      {hb && (
        <Tip x={hb.x + hb.w / 2} y={hb.y - 10} width={w}>
          <div className="vb-tip-title">{hb.label}</div>
          <TipRow color={colorOf(hb.model)} label={hb.model} value={wanLabel(hb.value)} />
        </Tip>
      )}
    </div>
  );
}
