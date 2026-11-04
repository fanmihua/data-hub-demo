/**
 * 极简的比例尺与路径工具，三版共用；样式与动画由各版自己决定。
 * 不依赖 d3，够画折线、面积、柱、环、仪表、桑基。
 */

export interface LinearScale {
  (v: number): number;
  domain: [number, number];
  range: [number, number];
  ticks: (count?: number) => number[];
  invert: (px: number) => number;
}

/** 好看的刻度步长 */
export function niceStep(span: number, count: number) {
  const raw = span / Math.max(1, count);
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / pow;
  return (n >= 7.5 ? 10 : n >= 3.5 ? 5 : n >= 1.5 ? 2 : 1) * pow;
}

/** 把上限取整到好看的数，例如 3860 万 → 4000 万 */
export function niceMax(max: number, count = 4) {
  if (max <= 0) return 1;
  const step = niceStep(max, count);
  return Math.ceil(max / step) * step;
}

export function scaleLinear(domain: [number, number], range: [number, number]): LinearScale {
  const [d0, d1] = domain, [r0, r1] = range;
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  const s = ((v: number) => r0 + (v - d0) * k) as LinearScale;
  s.domain = domain;
  s.range = range;
  s.invert = (px: number) => (k === 0 ? d0 : d0 + (px - r0) / k);
  s.ticks = (count = 4) => {
    const step = niceStep(d1 - d0, count);
    const out: number[] = [];
    for (let v = Math.ceil(d0 / step) * step; v <= d1 + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
    return out;
  };
  return s;
}

export interface BandScale {
  (key: string): number;
  bandwidth: number;
  step: number;
  keys: string[];
}

/** 分类比例尺：padding 为每格两侧留白的比例（0–1） */
export function scaleBand(keys: string[], range: [number, number], padding = 0.3): BandScale {
  const [r0, r1] = range;
  const step = keys.length ? (r1 - r0) / keys.length : 0;
  const bw = step * (1 - padding);
  const s = ((key: string) => r0 + keys.indexOf(key) * step + (step - bw) / 2) as BandScale;
  s.bandwidth = bw;
  s.step = step;
  s.keys = keys;
  return s;
}

export type Pt = [number, number];

export const linePath = (pts: Pt[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join('');

/** 单调三次插值的平滑折线（不会过冲，适合数据曲线） */
export function smoothPath(pts: Pt[]) {
  if (pts.length < 3) return linePath(pts);
  const n = pts.length;
  const dx: number[] = [], m: number[] = [], t: number[] = new Array(n);
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; m[i] = (pts[i + 1][1] - pts[i][1]) / (dx[i] || 1); }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
  let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${(pts[i][0] + h).toFixed(2)},${(pts[i][1] + h * t[i]).toFixed(2)} ${(pts[i + 1][0] - h).toFixed(2)},${(pts[i + 1][1] - h * t[i + 1]).toFixed(2)} ${pts[i + 1][0].toFixed(2)},${pts[i + 1][1].toFixed(2)}`;
  }
  return d;
}

/** 面积：上沿用 smooth 或直线，下沿回到 baseline */
export function areaPath(pts: Pt[], baseline: number, smooth = true) {
  if (!pts.length) return '';
  const top = smooth ? smoothPath(pts) : linePath(pts);
  return `${top}L${pts[pts.length - 1][0].toFixed(2)},${baseline}L${pts[0][0].toFixed(2)},${baseline}Z`;
}

/** 堆叠面积：lower 为下沿点（从左到右），upper 为上沿点 */
export function bandPath(upper: Pt[], lower: Pt[], smooth = true) {
  if (!upper.length) return '';
  const top = smooth ? smoothPath(upper) : linePath(upper);
  const rev = [...lower].reverse();
  const bottom = (smooth ? smoothPath(rev) : linePath(rev)).replace(/^M/, 'L');
  return `${top}${bottom}Z`;
}

/** 柱子：数据端圆角 r，基线端直角 */
export function barPath(x: number, y: number, w: number, h: number, r = 4, horizontal = false) {
  if (w <= 0 || h <= 0) return '';
  const rr = Math.min(r, horizontal ? h / 2 : w / 2, horizontal ? w : h);
  if (horizontal) return `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`;
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/** 圆弧（角度为弧度，0 指向 12 点方向，顺时针） */
export function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number): Pt => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
  return `M${x0.toFixed(2)},${y0.toFixed(2)}A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
}

/** 环形扇区（donut segment） */
export function ringPath(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number) {
  const p = (r: number, a: number): Pt => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [ax, ay] = p(r1, a0), [bx, by] = p(r1, a1), [cx2, cy2] = p(r0, a1), [dx, dy] = p(r0, a0);
  return `M${ax},${ay}A${r1},${r1} 0 ${large} 1 ${bx},${by}L${cx2},${cy2}A${r0},${r0} 0 ${large} 0 ${dx},${dy}Z`;
}

/** 最近点：给定像素 x，找到数组里离它最近的索引（用于十字线悬停） */
export function nearestIndex(xs: number[], px: number) {
  let best = 0, dist = Infinity;
  xs.forEach((x, i) => { const d = Math.abs(x - px); if (d < dist) { dist = d; best = i; } });
  return best;
}
