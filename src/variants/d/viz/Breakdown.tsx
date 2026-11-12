import { useId, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { hierarchy, pack, partition, treemap } from 'd3-hierarchy';
import { arc, area, curveBasis, stack, stackOffsetWiggle, stackOrderInsideOut } from 'd3-shape';
import { useSite } from '../../../core/provider';
import { pct, wan } from '../../../core/data/format';
import { Tip, TipHead, TipRow } from './Tip';
import { playIn, signature, useBox, useEntrance } from './util';
import './viz.css';

/**
 * 构成分析的六种图形（SVG 绘制，跟随容器）。数据都是报账单，按 型号 → 分系统 → 组件 和 月份 两条线拆。
 * 布局算法用开源的 d3-hierarchy（矩形树图、旭日图、气泡图）和 d3-shape（流图、圆弧），这里只管画和入场。
 *
 * - treemap   矩形树图：块的面积是报账金额，块底的细线是已付比例
 * - stream    流图：各分系统逐月的报账，带子越宽金额越大（wiggle 基线，没有纵轴，读数靠带子上的合计和顶上的月合计）
 * - heatmap   热力格：分系统 × 月份，一个色相由淡到浓
 * - sunburst  旭日图：里圈型号、中圈分系统、外圈组件
 * - bubble    气泡图：一张报账单一个气泡，按型号聚成团
 * - radial    径向条：每个分系统一圈弧，弧长是它占最大值的比例
 *
 * 颜色跟着实体走：型号用固定的型号色；分系统用它所属型号的颜色，同一型号下的第二个分系统调浅。
 * 入场用 util.playIn 的 data-pop / data-sweep / data-draw / data-fade，所以「重播动画」和换类型都会重播。
 */
export type BreakType = 'treemap' | 'stream' | 'heatmap' | 'sunburst' | 'bubble' | 'radial';
export interface BreakRow { id: string; month: string; model: string; system: string; component: string; amount: number; paid: number }

interface N { name: string; model?: string; system?: string; value?: number; paid?: number; children?: N[] }
type Hover = (e: PointerEvent<Element>, head: string, lines: [string, string][], color?: string) => void;
interface Api { w: number; h: number; rows: BreakRow[]; colorOfModel: (id: string) => string; sysColor: Record<string, { c: string; light: boolean }>; hover: Hover }

const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
function groupBy<T>(xs: T[], f: (x: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const x of xs) { const k = f(x); const g = m.get(k); if (g) g.push(x); else m.set(k, [x]); }
  return [...m];
}
const monthLabel = (m: string) => `${Number(m.slice(5))} 月`;
const yuan = (v: number) => `${wan(v)} 万元`;

/** 型号 → 分系统 → 组件 */
function buildTree(rows: BreakRow[]): N {
  return {
    name: 'root',
    children: groupBy(rows, r => r.model).map(([m, a]) => ({
      name: m, model: m,
      children: groupBy(a, r => r.system).map(([s, b]) => ({
        name: s, model: m, system: s,
        children: groupBy(b, r => r.component).map(([c, cs]) => ({ name: c, model: m, system: s, value: sum(cs, r => r.amount), paid: sum(cs, r => r.paid) })),
      })),
    })),
  };
}

/** 分系统的颜色：所属型号的颜色；同一型号下排第二的调浅（混 45% 白） */
function systemColors(rows: BreakRow[], colorOfModel: (id: string) => string) {
  const out: Record<string, { c: string; light: boolean }> = {};
  const seen: Record<string, number> = {};
  for (const [s, a] of groupBy(rows, r => r.system).sort((x, y) => sum(y[1], r => r.amount) - sum(x[1], r => r.amount))) {
    const m = groupBy(a, r => r.model).sort((x, y) => sum(y[1], r => r.amount) - sum(x[1], r => r.amount))[0][0];
    const i = seen[m] ?? 0;
    seen[m] = i + 1;
    out[s] = i === 0 ? { c: colorOfModel(m), light: false } : { c: `color-mix(in srgb, ${colorOfModel(m)} ${Math.max(40, 100 - i * 45)}%, #fff)`, light: true };
  }
  return out;
}

export function Breakdown({ type, rows, colorOfModel, ariaLabel }: { type: BreakType; rows: BreakRow[]; colorOfModel: (id: string) => string; ariaLabel: string }) {
  const { fx } = useSite();
  const root = useRef<HTMLDivElement>(null);
  const { width: w, height: h } = useBox(root);
  const [tip, setTip] = useState<{ x: number; y: number; head: string; lines: [string, string][]; color?: string } | null>(null);
  const ready = w > 40 && h > 40 && rows.length > 0;
  useEntrance(root, el => playIn(el, { duration: 900 }), { enabled: fx.motion, ready, key: signature([type, ...rows.map(r => r.id)]) });
  const sysColor = useMemo(() => systemColors(rows, colorOfModel), [rows, colorOfModel]);
  const hover: Hover = (e, head, lines, color) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ x: r.left + r.width / 2, y: r.top + 6, head, lines, color });
  };
  const api: Api = { w, h, rows, colorOfModel, sysColor, hover };
  let chart: ReactNode = null;
  if (ready) {
    chart = type === 'treemap' ? <TreemapChart {...api} /> : type === 'stream' ? <StreamChart {...api} /> : type === 'heatmap' ? <HeatChart {...api} />
      : type === 'sunburst' ? <SunburstChart {...api} /> : type === 'bubble' ? <BubbleChart {...api} /> : <RadialChart {...api} />;
  }
  return (
    <div ref={root} className={`vd-viz vd-bk is-${type}`} role="img" aria-label={ariaLabel} onPointerLeave={() => setTip(null)}>
      {chart}
      {!rows.length && <span className="vd-bk-empty">暂无数据</span>}
      {tip && (
        <Tip x={tip.x} y={tip.y} placement="above">
          <TipHead>{tip.head}</TipHead>
          {tip.lines.map(([l, v], i) => <TipRow key={l} color={i === 0 ? tip.color : undefined} label={l} value={v} />)}
        </Tip>
      )}
    </div>
  );
}

/* ───────── 矩形树图 ───────── */
function TreemapChart({ w, h, rows, colorOfModel, hover }: Api) {
  const gid = `bk${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const roomy = h >= 240 && w >= 360;
  const root = useMemo(() => {
    const t = hierarchy<N>(buildTree(rows)).sum(d => d.value ?? 0).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    return treemap<N>().size([w, h]).paddingOuter(d => (d.depth === 1 ? 6 : 0)).paddingInner(3)
      .paddingTop(d => (d.depth === 1 ? 26 : d.depth === 2 && roomy ? 18 : 0)).round(true)(t);
  }, [rows, w, h, roomy]);
  const leaves = root.leaves();
  const vmax = Math.max(1, ...leaves.map(l => l.value ?? 0));
  return (
    <svg width={w} height={h} className="vd-bk-svg">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".16" /><stop offset=".55" stopColor="#fff" stopOpacity="0" /></linearGradient>
      </defs>
      {(root.children ?? []).map(n => {
        const c = colorOfModel(n.data.name), gw = n.x1 - n.x0;
        return (
          <g key={n.data.name} data-fade="">
            <rect x={n.x0} y={n.y0} width={gw} height={n.y1 - n.y0} rx={9} className="vd-bk-group" style={{ fill: c, stroke: c }} />
            <circle cx={n.x0 + 12} cy={n.y0 + 13} r={3.5} style={{ fill: c }} />
            <text x={n.x0 + 21} y={n.y0 + 17} className="vd-bk-gname">{n.data.name}</text>
            {gw > 124 && <text x={n.x1 - 10} y={n.y0 + 17} textAnchor="end" className="vd-bk-gval">{yuan(n.value ?? 0)}</text>}
            {roomy && (n.children ?? []).map(s => (
              <text key={s.data.name} x={s.x0 + 2} y={s.y0 + 13} className="vd-bk-sname">{s.x1 - s.x0 > 96 ? `${s.data.name} · ${wan(s.value ?? 0)}` : s.x1 - s.x0 > 30 ? s.data.name.replace('分系统', '') : ''}</text>
            ))}
          </g>
        );
      })}
      {leaves.map((n, i) => {
        const bw = n.x1 - n.x0, bh = n.y1 - n.y0, c = colorOfModel(n.data.model ?? ''), v = n.value ?? 0, paid = n.data.paid ?? 0;
        const big = Math.min(34, Math.max(16, Math.min(bw / 4.4, bh / 3.2)));
        return (
          <g key={`${n.data.model}-${n.data.system}-${n.data.name}`} transform={`translate(${n.x0},${n.y0})`}>
            <g data-pop="" data-delay={i * 45} className="vd-bk-mark" onPointerEnter={e => hover(e, `${n.data.model} · ${n.data.name}`, [['报账', yuan(v)], ['已付', `${yuan(paid)}（${pct(v ? paid / v : 0)}）`]], c)}>
              <rect width={bw} height={bh} rx={6} style={{ fill: c, fillOpacity: 0.5 + 0.42 * Math.sqrt(v / vmax) }} />
              <rect width={bw} height={bh} rx={6} fill={`url(#${gid})`} />
              {bw > 40 && bh > 26 && <>
                <rect x={8} y={bh - 9} width={bw - 16} height={3} rx={1.5} className="vd-bk-track" />
                <rect x={8} y={bh - 9} width={Math.max(0, (bw - 16) * (v ? paid / v : 0))} height={3} rx={1.5} className="vd-bk-paid" />
              </>}
              {bw > 70 && bh > 52
                ? <><text x={10} y={20} className="vd-bk-lname">{n.data.name}</text><text x={10} y={24 + big} className="vd-bk-lval" style={{ fontSize: big }}>{wan(v)}<tspan className="vd-bk-unit" dx={4}>万元</tspan></text></>
                : bw > 30 && bh > 18 ? <text x={bw / 2} y={bh / 2 + 4} textAnchor="middle" className="vd-bk-lval" style={{ fontSize: 12 }}>{wan(v)}</text> : null}
            </g>
          </g>
        );
      })}
    </svg>
  );
}

/* ───────── 流图 ───────── */
function StreamChart({ w, h, rows, sysColor, hover }: Api) {
  const { months, systems, table } = useMemo(() => {
    const months = [...new Set(rows.map(r => r.month))].sort();
    const systems = groupBy(rows, r => r.system).sort((a, b) => sum(b[1], r => r.amount) - sum(a[1], r => r.amount)).map(g => g[0]);
    const zero = { m: '', v: {} as Record<string, number> };
    // 两头各垫一个 0：带子从细到粗再收回去
    const table = [zero, ...months.map(m => ({ m, v: Object.fromEntries(systems.map(s => [s, sum(rows.filter(r => r.month === m && r.system === s), r => r.amount)])) })), zero];
    return { months, systems, table };
  }, [rows]);
  const top = 26, bottom = 24, n = table.length;
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * w : w / 2);
  const series = useMemo(() => stack<{ m: string; v: Record<string, number> }>().keys(systems).value((d, k) => d.v[k] ?? 0).offset(stackOffsetWiggle).order(stackOrderInsideOut)(table), [systems, table]);
  const lo = Math.min(...series.flatMap(s => s.map(d => d[0]))), hi = Math.max(...series.flatMap(s => s.map(d => d[1])));
  const y = (v: number) => h - bottom - ((v - lo) / Math.max(1e-9, hi - lo)) * (h - bottom - top);
  const shape = area<[number, number]>().x((_, i) => x(i)).y0(d => y(d[0])).y1(d => y(d[1])).curve(curveBasis);
  return (
    <svg width={w} height={h} className="vd-bk-svg">
      {months.map((m, i) => <line key={m} x1={x(i + 1)} x2={x(i + 1)} y1={top - 4} y2={h - bottom + 4} className="vd-bk-grid" />)}
      <g data-sweep="">
        {series.map(s => {
          const tot = sum(rows.filter(r => r.system === s.key), r => r.amount);
          return <path key={s.key} d={shape(s.map(d => [d[0], d[1]] as [number, number])) ?? ''} className="vd-bk-band vd-bk-mark" style={{ fill: sysColor[s.key]?.c }}
            onPointerEnter={e => hover(e, s.key, [['报账合计', yuan(tot)]], sysColor[s.key]?.c)} />;
        })}
      </g>
      {series.map(s => {
        let bi = 1;
        s.forEach((d, i) => { if (d[1] - d[0] > s[bi][1] - s[bi][0]) bi = i; });
        const th = Math.abs(y(s[bi][0]) - y(s[bi][1]));
        if (th < 32 || w < 300) return null;
        const cy = y((s[bi][0] + s[bi][1]) / 2), tot = sum(rows.filter(r => r.system === s.key), r => r.amount);
        return (
          <g key={s.key} data-fade="" className={`vd-bk-on${sysColor[s.key]?.light ? ' is-light' : ''}`}>
            <text x={x(bi)} y={cy - 2} textAnchor="middle" className="vd-bk-lname">{s.key}</text>
            <text x={x(bi)} y={cy + 15} textAnchor="middle" className="vd-bk-lval" style={{ fontSize: 15 }}>{yuan(tot)}</text>
          </g>
        );
      })}
      {months.map((m, i) => (
        <g key={m} data-fade="">
          <text x={x(i + 1)} y={h - 6} textAnchor="middle" className="vd-bk-axis">{monthLabel(m)}</text>
          <text x={x(i + 1)} y={12} textAnchor="middle" className="vd-bk-total">{wan(sum(rows.filter(r => r.month === m), r => r.amount))}</text>
        </g>
      ))}
    </svg>
  );
}

/* ───────── 热力格 ───────── */
function HeatChart({ w, h, rows, hover }: Api) {
  const months = useMemo(() => [...new Set(rows.map(r => r.month))].sort(), [rows]);
  const systems = useMemo(() => groupBy(rows, r => r.system).sort((a, b) => sum(b[1], r => r.amount) - sum(a[1], r => r.amount)).map(g => g[0]), [rows]);
  const narrow = w < 360;
  const left = narrow ? 44 : Math.min(112, w * 0.2), right = narrow ? 0 : 58, top = 20, gap = narrow ? 3 : 5;
  const cw = (w - left - right - gap * (months.length - 1)) / Math.max(1, months.length), ch = (h - top - gap * (systems.length - 1)) / Math.max(1, systems.length);
  const cell = (s: string, m: string) => sum(rows.filter(r => r.system === s && r.month === m), r => r.amount);
  const vmax = Math.max(1, ...systems.flatMap(s => months.map(m => cell(s, m))));
  const fs = Math.max(11, Math.min(22, ch * 0.34, cw * 0.3));
  return (
    <svg width={w} height={h} className="vd-bk-svg">
      {months.map((m, j) => <text key={m} x={left + j * (cw + gap) + cw / 2} y={12} textAnchor="middle" className="vd-bk-axis" data-fade="">{monthLabel(m)}</text>)}
      {!narrow && <text x={w - 2} y={12} textAnchor="end" className="vd-bk-axis" data-fade="">合计</text>}
      {systems.map((s, i) => {
        const yy = top + i * (ch + gap);
        return (
          <g key={s}>
            <text x={0} y={yy + ch / 2 + 4} className="vd-bk-row" data-fade="">{narrow ? s.replace('分系统', '') : s}</text>
            {months.map((m, j) => {
              const v = cell(s, m), k = v / vmax;
              return (
                <g key={m} transform={`translate(${left + j * (cw + gap)},${yy})`}>
                  <g data-pop="" data-delay={(i + j) * 55} className="vd-bk-mark" onPointerEnter={e => hover(e, `${s} · ${monthLabel(m)}`, [['报账', v ? yuan(v) : '无']])}>
                    <rect width={cw} height={ch} rx={Math.min(8, ch / 4)} className={v ? 'vd-bk-cell' : 'vd-bk-cell is-zero'} style={v ? { fillOpacity: 0.16 + 0.84 * Math.pow(k, 0.8) } : undefined} />
                    {v > 0 && cw > 26 && <text x={cw / 2} y={ch / 2 + fs * 0.36} textAnchor="middle" className={`vd-bk-lval${k > 0.6 ? ' is-hot' : ' is-cool'}`} style={{ fontSize: fs }}>{wan(v)}</text>}
                  </g>
                </g>
              );
            })}
            {!narrow && <text x={w - 2} y={yy + ch / 2 + 6} textAnchor="end" className="vd-bk-rowsum" data-fade="">{wan(sum(rows.filter(r => r.system === s), r => r.amount))}</text>}
          </g>
        );
      })}
    </svg>
  );
}

/* ───────── 旭日图 ───────── */
function SunburstChart({ w, h, rows, colorOfModel, hover }: Api) {
  const side = w >= h * 1.5 && w >= 360;
  const R = Math.max(20, Math.min(h / 2 - 2, (side ? w * 0.5 : w) / 2 - 2));
  // 宽格位：图和图例并成一组放在正中，图例最多 260px 宽，不拉满整格
  const LW = side ? Math.min(260, w - R * 2 - 36) : 0, x0 = side ? (w - (R * 2 + 28 + LW)) / 2 : 0;
  const cx = side ? x0 + R : w / 2, cy = h / 2;
  const r0 = R * 0.36, band = (R - r0) / 3;
  const root = useMemo(() => partition<N>().size([Math.PI * 2, 3])(hierarchy<N>(buildTree(rows)).sum(d => d.value ?? 0).sort((a, b) => (b.value ?? 0) - (a.value ?? 0))), [rows]);
  const mk = arc<{ a0: number; a1: number; r0: number; r1: number }>().startAngle(d => d.a0).endAngle(d => d.a1).innerRadius(d => d.r0).outerRadius(d => d.r1).padAngle(0.014).padRadius(R * 0.6).cornerRadius(3);
  const total = root.value ?? 0;
  const nodes = root.descendants().filter(n => n.depth > 0);
  return (
    <svg width={w} height={h} className="vd-bk-svg">
      <g transform={`translate(${cx},${cy})`}>
        {nodes.map((n, i) => {
          const c = colorOfModel(n.data.model ?? ''), v = n.value ?? 0;
          const d = mk({ a0: n.x0, a1: n.x1, r0: r0 + (n.depth - 1) * band + 1.5, r1: r0 + n.depth * band - 1.5 }) ?? '';
          const mid = (n.x0 + n.x1) / 2, rr = r0 + (n.depth - 0.5) * band;
          const span = (n.x1 - n.x0) * rr;
          return (
            <g key={`${n.depth}-${n.data.model}-${n.data.system ?? ''}-${n.data.name}`}>
              <path d={d} data-pop="" data-delay={(n.depth - 1) * 160 + i * 28} className="vd-bk-mark" style={{ fill: c, fillOpacity: n.depth === 1 ? 0.95 : n.depth === 2 ? 0.7 : 0.46 }}
                onPointerEnter={e => hover(e, n.depth === 1 ? n.data.name : `${n.data.model} · ${n.data.name}`, [['报账', yuan(v)], ['占比', pct(total ? v / total : 0)]], c)} />
              {n.depth === 1 && span > 44 && band > 18 && <text x={Math.sin(mid) * rr} y={-Math.cos(mid) * rr + 4} textAnchor="middle" className="vd-bk-lname is-on" data-fade="">{n.data.name}</text>}
            </g>
          );
        })}
        <text y={-2} textAnchor="middle" className="vd-bk-center" style={{ fontSize: Math.max(14, r0 * 0.52) }} data-fade="">{wan(total)}</text>
        <text y={Math.max(14, r0 * 0.4)} textAnchor="middle" className="vd-bk-axis" data-fade="">万元</text>
      </g>
      {side && (root.children ?? []).map((n, i) => {
        const yy = cy - ((root.children?.length ?? 1) - 1) * 21 + i * 42, xx = x0 + R * 2 + 28, xr = xx + LW;
        return (
          <g key={n.data.name} data-fade="">
            <circle cx={xx} cy={yy - 5} r={4} style={{ fill: colorOfModel(n.data.name) }} />
            <text x={xx + 12} y={yy - 1} className="vd-bk-gname">{n.data.name}</text>
            <text x={xx + 12} y={yy + 16} className="vd-bk-sname">{(n.children ?? []).map(s => s.data.name.replace('分系统', '')).join(' · ')}</text>
            <text x={xr} y={yy - 1} textAnchor="end" className="vd-bk-rowsum">{wan(n.value ?? 0)}</text>
            <text x={xr} y={yy + 16} textAnchor="end" className="vd-bk-sname">{pct(total ? (n.value ?? 0) / total : 0)}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ───────── 气泡图 ───────── */
function BubbleChart({ w, h, rows, colorOfModel, hover }: Api) {
  const groups = useMemo(() => {
    const gs = groupBy(rows, r => r.model).map(([m, a]) => ({ m, v: sum(a, r => r.amount), node: { name: m, model: m, children: a.map(r => ({ name: r.component, model: m, system: r.system, value: r.amount, paid: r.paid })) } as N })).sort((a, b) => b.v - a.v);
    const sorted = (n: N) => hierarchy<N>(n).sum(d => d.value ?? 0).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    if (w < h * 1.4) {
      // 接近方形的格位：所有型号一起装进一个大圆
      const root = pack<N>().size([w, h]).padding(d => (d.depth === 0 ? 12 : 4))(sorted({ name: 'root', children: gs.map(g => g.node) }));
      return (root.children ?? []).map(n => ({ m: n.data.name, x: n.x, y: n.y, r: n.r, leaves: n.leaves().map(l => ({ x: l.x, y: l.y, r: l.r, d: l.data, v: l.value ?? 0 })) }));
    }
    // 宽格位：每个型号各自成团，横着排开，最大的那团占满格高
    const vmax = Math.max(1, ...gs.map(g => g.v)), gap = 18;
    const raw = gs.map(g => h * Math.sqrt(g.v / vmax));
    const k = Math.min(1, w / (sum(raw, v => v) + gap * (gs.length - 1)));
    let x = (w - (sum(raw, v => v) * k + gap * k * (gs.length - 1))) / 2;
    return gs.map((g, i) => {
      const sz = raw[i] * k, root = pack<N>().size([sz, sz]).padding(4)(sorted(g.node));
      const ox = x, oy = (h - sz) / 2;
      x += sz + gap * k;
      return { m: g.m, x: ox + root.x, y: oy + root.y, r: root.r, leaves: root.leaves().map(l => ({ x: ox + l.x, y: oy + l.y, r: l.r, d: l.data, v: l.value ?? 0 })) };
    });
  }, [rows, w, h]);
  return (
    <svg width={w} height={h} className="vd-bk-svg">
      {groups.map(g => (
        <g key={g.m} data-fade="">
          <circle cx={g.x} cy={g.y} r={g.r} className="vd-bk-group" style={{ fill: colorOfModel(g.m), stroke: colorOfModel(g.m) }} />
          <text x={g.x} y={g.y - g.r + 15} textAnchor="middle" className="vd-bk-gname">{g.m}</text>
        </g>
      ))}
      {groups.flatMap(g => g.leaves.map(l => ({ ...l, m: g.m }))).map((n, i) => {
        const c = colorOfModel(n.m), v = n.v, paid = n.d.paid ?? 0;
        return (
          <g key={i} transform={`translate(${n.x},${n.y})`}>
            <g data-pop="" data-delay={i * 50} className="vd-bk-mark" onPointerEnter={e => hover(e, `${n.m} · ${n.d.name}`, [['报账', yuan(v)], ['已付', `${yuan(paid)}（${pct(v ? paid / v : 0)}）`]], c)}>
              <circle r={n.r} style={{ fill: c, fillOpacity: 0.34 + 0.56 * (v ? paid / v : 0) }} />
              <circle r={Math.max(0, n.r - 1)} className="vd-bk-rim" style={{ stroke: c }} />
              {n.r > 26 && <text y={-3} textAnchor="middle" className="vd-bk-lname">{n.d.name}</text>}
              {n.r > 15 && <text y={n.r > 26 ? 15 : 4} textAnchor="middle" className="vd-bk-lval" style={{ fontSize: n.r > 26 ? Math.min(20, n.r * 0.4) : 11 }}>{wan(v)}</text>}
            </g>
          </g>
        );
      })}
    </svg>
  );
}

/* ───────── 径向条 ───────── */
function RadialChart({ w, h, rows, sysColor, hover }: Api) {
  const items = useMemo(() => groupBy(rows, r => r.system).map(([s, a]) => ({ s, v: sum(a, r => r.amount) })).sort((a, b) => b.v - a.v), [rows]);
  const side = w >= h * 1.5 && w >= 360;
  const R = Math.max(24, Math.min(h / 2 - 2, w / 2 - 2));
  const LW = side ? Math.min(240, w - R * 2 - 36) : 0, x0 = side ? (w - (R * 2 + 28 + LW)) / 2 : 0;
  const cx = side ? x0 + R : w / 2, cy = h / 2;
  const n = Math.max(1, items.length), t = Math.max(5, Math.min(18, (R * 0.62) / n - 5)), gap = Math.max(4, t * 0.42);
  const vmax = Math.max(1, ...items.map(i => i.v)), total = sum(items, i => i.v);
  const SWEEP = Math.PI * 1.5;
  const pathOf = (r: number, a: number) => {
    const x1 = cx + Math.sin(a) * r, y1 = cy - Math.cos(a) * r;
    return `M ${cx} ${cy - r} A ${r} ${r} 0 ${a > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };
  return (
    <svg width={w} height={h} className="vd-bk-svg">
      {items.map((it, i) => {
        const r = R - t / 2 - i * (t + gap), c = sysColor[it.s]?.c;
        return (
          <g key={it.s} className="vd-bk-mark" onPointerEnter={e => hover(e, it.s, [['报账', yuan(it.v)], ['占比', pct(total ? it.v / total : 0)]], c)}>
            <path d={pathOf(r, SWEEP)} className="vd-bk-rtrack" style={{ strokeWidth: t }} />
            <path d={pathOf(r, Math.max(0.02, SWEEP * (it.v / vmax)))} pathLength={1} data-draw="" data-delay={i * 90} className="vd-bk-rbar" style={{ stroke: c, strokeWidth: t }} />
            {!side && <text x={cx - 10} y={cy - r + 4} textAnchor="end" className="vd-bk-rlabel" data-fade="">{w > 300 ? it.s : it.s.replace('分系统', '')}<tspan className="vd-bk-rnum" dx={8}>{wan(it.v)}</tspan></text>}
          </g>
        );
      })}
      {side && items.map((it, i) => {
        const yy = cy - (items.length - 1) * 15 + i * 30, xx = x0 + R * 2 + 28;
        return (
          <g key={it.s} data-fade="">
            <circle cx={xx} cy={yy - 4} r={4} style={{ fill: sysColor[it.s]?.c }} />
            <text x={xx + 12} y={yy} className="vd-bk-gname">{it.s}</text>
            <text x={xx + LW} y={yy + 1} textAnchor="end" className="vd-bk-rowsum">{wan(it.v)}<tspan className="vd-bk-sname" dx={8}>{pct(total ? it.v / total : 0)}</tspan></text>
          </g>
        );
      })}
      <text x={cx} y={cy + 4} textAnchor="middle" className="vd-bk-center" style={{ fontSize: Math.max(13, (R - n * (t + gap)) * 0.5) }} data-fade="">{wan(total)}</text>
      <text x={cx} y={cy + 4 + Math.max(13, (R - n * (t + gap)) * 0.36)} textAnchor="middle" className="vd-bk-axis" data-fade="">万元</text>
    </svg>
  );
}

/* ───────── 分段条（替代环形图）：一整条按占比分段，数直接写在段上 ───────── */
export interface SegItem { key: string; label: string; color: string; ratio: number; display: string }
export function SegBar({ items, total, note, title, ariaLabel, compact }: { items: SegItem[]; total: string; note: string; title?: string; ariaLabel: string; compact?: boolean }) {
  const { fx } = useSite();
  const root = useRef<HTMLDivElement>(null);
  const { width } = useBox(root);
  useEntrance(root, el => playIn(el, { duration: 760 }), { enabled: fx.motion, key: signature(items.map(i => `${i.key}:${i.ratio.toFixed(3)}`)) });
  const sumR = Math.max(1e-9, sum(items, i => Math.max(0, i.ratio)));
  return (
    <div ref={root} className={`vd-viz vd-share${compact ? ' is-compact' : ''}`} role="img" aria-label={ariaLabel}>
      <div className="vd-share-head">
        {title && <span className="vd-share-title">{title}</span>}
        <b>{total}</b><small>{note}</small>
      </div>
      <div className="vd-share-bar">
        {items.map((it, i) => {
          const pw = (Math.max(0, it.ratio) / sumR) * width;
          return (
            <span key={it.key} className="vd-share-part" data-pop="" data-delay={i * 90} style={{ flexGrow: Math.max(0.03, it.ratio / sumR), '--c': it.color } as CSSProperties} title={`${it.label} ${pct(it.ratio)}，${it.display}`}>
              {pw > 54 && <b>{pct(it.ratio)}</b>}
              {!compact && pw > 150 && <em>{it.display}</em>}
            </span>
          );
        })}
      </div>
      <div className="vd-share-legend" data-fade="">
        {items.map(it => <span key={it.key}><i style={{ background: it.color }} />{it.label}<b>{pct(it.ratio)}</b></span>)}
      </div>
    </div>
  );
}
