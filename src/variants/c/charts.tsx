import { Fragment, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { useSite } from '../../core/provider';
import { barPath, nearestIndex, niceMax, scaleLinear, smoothPath, areaPath, type Pt } from '../../core/charts/scale';
import { layoutSankey } from '../../core/charts/sankey';
import type { FlowLink, FlowNode } from '../../core/data/derive';
import { pct, wan } from '../../core/data/format';
import { playDrawIn, useEnter, useSize } from './lib';
import { Tip } from './ui';

/* ------------------------------------------------------------------ */
/* 通用：悬停索引（鼠标移动、触控点按、键盘左右键）                       */
/* ------------------------------------------------------------------ */
function useIndexHover(count: number) {
  const [hi, setHi] = useState<number | null>(null);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); setHi(i => Math.min(count - 1, (i ?? -1) + 1)); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); setHi(i => Math.max(0, (i ?? count) - 1)); }
    else if (e.key === 'Escape') setHi(null);
  };
  return { hi, setHi, onKey };
}

const fmtWan = (v: number) => wan(v, 0);

/* ------------------------------------------------------------------ */
/* 折线图：十字线 + 提示框 + 末端直接标数 + 编号注释线                    */
/* ------------------------------------------------------------------ */
export interface LineSeries { id: string; label: string; color: string; values: number[] }

export function LineChart({ labels, series, height = 340, notes = [], ariaLabel, replay }: {
  labels: string[];
  series: LineSeries[];
  height?: number;
  notes?: { index: number; label?: string }[];
  ariaLabel: string;
  replay?: unknown;
}) {
  const { fx } = useSite();
  const wrap = useRef<HTMLDivElement>(null);
  const { width } = useSize(wrap);
  const { hi, setHi, onKey } = useIndexHover(labels.length);
  const narrow = width < 560;
  const m = { t: 34, r: narrow ? 64 : 104, b: 34, l: narrow ? 40 : 52 };
  const iw = Math.max(10, width - m.l - m.r), ih = height - m.t - m.b;
  const max = niceMax(Math.max(1, ...series.flatMap(s => s.values)), 4);
  const y = scaleLinear([0, max], [m.t + ih, m.t]);
  const xs = labels.map((_, i) => m.l + (labels.length <= 1 ? iw / 2 : (i * iw) / (labels.length - 1)));
  useEnter(wrap, el => playDrawIn(el), { enabled: fx.motion, ready: width > 0, replay });

  // 末端标签：按 y 排序后保证最小间距，避免重叠
  const ends = useMemo(() => {
    const last = labels.length - 1;
    const arr = series.map(s => ({ s, y: y(s.values[last] ?? 0) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < arr.length; i++) if (arr[i].y - arr[i - 1].y < 30) arr[i].y = arr[i - 1].y + 30;
    return arr;
  }, [series, labels.length, height, max]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHi(nearestIndex(xs, e.clientX - r.left));
  };

  return (
    <div className="vc-chart" ref={wrap} style={{ height }}>
      {width > 0 && labels.length > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} tabIndex={0}
          onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={e => { if (e.pointerType === 'mouse') setHi(null); }}
          onKeyDown={onKey} onBlur={() => setHi(null)}>
          <text x={m.l - 10} y={m.t - 16} className="vc-axis" textAnchor="end">万元</text>
          {y.ticks(4).map(t => (
            <g key={t}>
              <line x1={m.l} x2={width - m.r + 8} y1={y(t)} y2={y(t)} className={t === 0 ? 'vc-base' : 'vc-grid'} />
              <text x={m.l - 10} y={y(t)} dy="0.32em" className="vc-axis" textAnchor="end">{fmtWan(t)}</text>
            </g>
          ))}
          {labels.map((l, i) => <text key={l + i} x={xs[i]} y={height - 10} className={`vc-axis ${hi === i ? 'is-on' : ''}`} textAnchor="middle">{l}</text>)}
          {notes.map((n, k) => n.index >= 0 && n.index < xs.length && (
            <g key={k} className="vc-anno" data-fade>
              <line x1={xs[n.index]} x2={xs[n.index]} y1={m.t - 6} y2={m.t + ih} />
              <circle cx={xs[n.index]} cy={m.t - 14} r={9} />
              <text x={xs[n.index]} y={m.t - 14} dy="0.34em" textAnchor="middle">{k + 1}</text>
            </g>
          ))}
          {series.map(s => {
            const pts: Pt[] = s.values.map((v, i) => [xs[i], y(v)]);
            return <path key={s.id} d={smoothPath(pts)} className="vc-line" style={{ stroke: s.color }} pathLength={1} strokeDasharray="1" data-draw />;
          })}
          {ends.map(({ s, y: ey }) => (
            <g key={s.id} className="vc-endlabel" data-fade>
              <circle cx={xs[xs.length - 1]} cy={y(s.values[s.values.length - 1] ?? 0)} r={3.5} style={{ fill: s.color }} />
              <text x={xs[xs.length - 1] + 10} y={ey - 3} className="vc-endlabel-k">{s.label}</text>
              <text x={xs[xs.length - 1] + 10} y={ey + 11} className="vc-endlabel-v">{fmtWan(s.values[s.values.length - 1] ?? 0)} 万</text>
            </g>
          ))}
          {hi !== null && (
            <g className="vc-cross" aria-hidden="true">
              <line x1={xs[hi]} x2={xs[hi]} y1={m.t} y2={m.t + ih} />
              {series.map(s => <circle key={s.id} cx={xs[hi]} cy={y(s.values[hi] ?? 0)} r={4.5} style={{ stroke: s.color }} />)}
            </g>
          )}
        </svg>
      )}
      {hi !== null && width > 0 && (
        <Tip x={xs[hi]} y={m.t + ih * 0.45} width={width}>
          <p className="vc-tip-h">{labels[hi]}</p>
          {series.map(s => <p key={s.id} className="vc-tip-row"><i style={{ background: s.color }} />{s.label}<b>{fmtWan(s.values[hi] ?? 0)} 万元</b></p>)}
          {series.length > 1 && <p className="vc-tip-row is-total">合计<b>{fmtWan(series.reduce((a, s) => a + (s.values[hi] ?? 0), 0))} 万元</b></p>}
        </Tip>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 分组柱：单根悬停，柱宽 ≤ 24px，数据端 4px 圆角                        */
/* ------------------------------------------------------------------ */
export interface ColumnSeries { id: string; label: string; color: string; kind?: 'solid' | 'light'; values: number[] }

export function ColumnChart({ labels, series, height = 320, notes = [], ariaLabel, replay, labelMax = true }: {
  labels: string[];
  series: ColumnSeries[];
  height?: number;
  notes?: { index: number }[];
  ariaLabel: string;
  replay?: unknown;
  labelMax?: boolean;
}) {
  const { fx } = useSite();
  const wrap = useRef<HTMLDivElement>(null);
  const { width } = useSize(wrap);
  const [hi, setHi] = useState<{ i: number; s: number } | null>(null);
  const m = { t: 34, r: 12, b: 34, l: width < 560 ? 40 : 52 };
  const iw = Math.max(10, width - m.l - m.r), ih = height - m.t - m.b;
  const max = niceMax(Math.max(1, ...series.flatMap(s => s.values)), 4);
  const y = scaleLinear([0, max], [m.t + ih, m.t]);
  const step = labels.length ? iw / labels.length : 0;
  const gap = 4;
  const bw = Math.max(4, Math.min(24, (step * 0.62 - gap * (series.length - 1)) / Math.max(1, series.length)));
  const groupW = bw * series.length + gap * (series.length - 1);
  const x0 = (i: number) => m.l + i * step + (step - groupW) / 2;
  useEnter(wrap, el => playDrawIn(el), { enabled: fx.motion, ready: width > 0, replay });

  let maxAt = { i: 0, s: 0, v: -1 };
  series.forEach((s, si) => s.values.forEach((v, i) => { if (v > maxAt.v) maxAt = { i, s: si, v }; }));
  const count = labels.length * series.length;
  const onKey = (e: KeyboardEvent) => {
    const flat = hi ? hi.i * series.length + hi.s : -1;
    if (e.key === 'ArrowRight') { e.preventDefault(); const n = Math.min(count - 1, flat + 1); setHi({ i: Math.floor(n / series.length), s: n % series.length }); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); const n = Math.max(0, flat < 0 ? count - 1 : flat - 1); setHi({ i: Math.floor(n / series.length), s: n % series.length }); }
    else if (e.key === 'Escape') setHi(null);
  };

  return (
    <div className="vc-chart" ref={wrap} style={{ height }}>
      {width > 0 && labels.length > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} tabIndex={0} onKeyDown={onKey} onBlur={() => setHi(null)}
          onPointerLeave={e => { if (e.pointerType === 'mouse') setHi(null); }}>
          <text x={m.l - 10} y={m.t - 16} className="vc-axis" textAnchor="end">万元</text>
          {y.ticks(4).map(t => (
            <g key={t}>
              <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} className={t === 0 ? 'vc-base' : 'vc-grid'} />
              <text x={m.l - 10} y={y(t)} dy="0.32em" className="vc-axis" textAnchor="end">{fmtWan(t)}</text>
            </g>
          ))}
          {labels.map((l, i) => <text key={l + i} x={m.l + i * step + step / 2} y={height - 10} className={`vc-axis ${hi?.i === i ? 'is-on' : ''}`} textAnchor="middle">{l}</text>)}
          {notes.map((n, k) => n.index >= 0 && n.index < labels.length && (
            <g key={k} className="vc-anno" data-fade>
              <line x1={m.l + n.index * step + step / 2} x2={m.l + n.index * step + step / 2} y1={m.t - 6} y2={m.t + ih} />
              <circle cx={m.l + n.index * step + step / 2} cy={m.t - 14} r={9} />
              <text x={m.l + n.index * step + step / 2} y={m.t - 14} dy="0.34em" textAnchor="middle">{k + 1}</text>
            </g>
          ))}
          {labels.map((_, i) => (
            <g key={i}>
              <rect x={m.l + i * step} y={m.t} width={step} height={ih} className="vc-hit"
                onPointerEnter={e => { if (e.pointerType === 'mouse') setHi({ i, s: series.length - 1 }); }} />
              {series.map((s, si) => {
                const v = s.values[i] ?? 0;
                const bx = x0(i) + si * (bw + gap);
                const on = hi?.i === i && hi?.s === si;
                return (
                  <path key={s.id} d={barPath(bx, y(v), bw, m.t + ih - y(v), 4)} data-grow="y"
                    className={`vc-bar ${s.kind === 'light' ? 'is-light' : ''} ${hi && !on ? 'is-dim' : ''}`} style={{ '--c': s.color } as CSSProperties}
                    onPointerEnter={() => setHi({ i, s: si })} onPointerDown={() => setHi({ i, s: si })} />
                );
              })}
            </g>
          ))}
          {labelMax && maxAt.v > 0 && (
            <text x={x0(maxAt.i) + maxAt.s * (bw + gap) + bw / 2} y={y(maxAt.v) - 8} className="vc-direct" textAnchor="middle" data-fade>{fmtWan(maxAt.v)}</text>
          )}
        </svg>
      )}
      {hi && width > 0 && (
        <Tip x={x0(hi.i) + hi.s * (bw + gap) + bw / 2} y={Math.max(m.t + 20, y(series[hi.s].values[hi.i] ?? 0) + 10)} width={width}>
          <p className="vc-tip-h">{labels[hi.i]}</p>
          {series.map((s, si) => <p key={s.id} className={`vc-tip-row ${si === hi.s ? 'is-on' : ''}`}><i style={{ background: s.color, opacity: s.kind === 'light' ? 0.4 : 1 }} />{s.label}<b>{fmtWan(s.values[hi.i] ?? 0)} 万元</b></p>)}
        </Tip>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 横向子弹条（HTML）：外框 = 总量，浅色 = 中间量，实色 = 已完成量         */
/* ------------------------------------------------------------------ */
export interface BarRow { key: string; label: string; sub?: string; color: string; total?: number; a: number; b?: number; value: ReactNode; tip: ReactNode; note?: number }

export function BarRows({ rows, ariaLabel, replay, unit = '万元' }: { rows: BarRow[]; ariaLabel: string; replay?: unknown; unit?: string }) {
  const { fx } = useSite();
  const ref = useRef<HTMLDivElement>(null);
  const { width } = useSize(ref);
  const [hi, setHi] = useState<string | null>(null);
  const max = niceMax(Math.max(1, ...rows.map(r => Math.max(r.total ?? 0, r.a, r.b ?? 0))), 4);
  const ticks = scaleLinear([0, max], [0, 1]).ticks(width < 420 ? 2 : 4);
  const w = (v: number) => `${(v / max) * 100}%`;
  useEnter(ref, el => playDrawIn(el, { duration: 1000 }), { enabled: fx.motion, replay });
  const hiRow = rows.find(r => r.key === hi);
  const hiIndex = rows.findIndex(r => r.key === hi);
  return (
    <div className="vc-rows" ref={ref} role="group" aria-label={ariaLabel} onPointerLeave={e => { if (e.pointerType === 'mouse') setHi(null); }}>
      <div className="vc-rows-axis" aria-hidden="true">
        <span className="vc-rows-unit">{unit}</span>
        <div className="vc-rows-ticks">{ticks.map(t => <span key={t} style={{ left: w(t) }}>{fmtWan(t)}</span>)}</div>
      </div>
      {rows.map(r => (
        <div key={r.key} className={`vc-row ${hi && hi !== r.key ? 'is-dim' : ''} ${hi === r.key ? 'is-on' : ''}`} tabIndex={0}
          onPointerEnter={() => setHi(r.key)} onPointerDown={() => setHi(r.key)} onFocus={() => setHi(r.key)} onBlur={() => setHi(null)}>
          <div className="vc-row-label"><b>{r.label}</b>{r.sub && <span>{r.sub}</span>}</div>
          <div className="vc-row-track">
            {ticks.map(t => <i key={t} className="vc-row-grid" style={{ left: w(t) }} aria-hidden="true" />)}
            {r.total !== undefined && <span className="vc-row-total" style={{ width: w(r.total) }} data-grow="x" />}
            <span className="vc-row-a" style={{ width: w(r.a), '--c': r.color } as CSSProperties} data-grow="x" />
            {r.b !== undefined && <span className="vc-row-b" style={{ width: w(r.b), '--c': r.color } as CSSProperties} data-grow="x" />}
            {r.note !== undefined && <span className="vc-row-note" style={{ left: w(Math.max(r.total ?? 0, r.a)) }} aria-hidden="true">{r.note}</span>}
          </div>
          <div className="vc-row-value">{r.value}</div>
        </div>
      ))}
      {hiRow && (
        <div className="vc-tip is-row" role="status" style={{ top: `calc(${hiIndex + 1} * var(--vc-row-h) + 28px)` }}>
          <p className="vc-tip-h">{hiRow.label}{hiRow.sub ? ` · ${hiRow.sub}` : ''}</p>
          {hiRow.tip}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 哑铃点图：两个比率放在同一根 0–100% 轴上                               */
/* ------------------------------------------------------------------ */
export function Dumbbell({ rows, aLabel, bLabel, ariaLabel }: {
  rows: { key: string; label: string; color: string; a: number; b: number }[];
  aLabel: string; bLabel: string; ariaLabel: string;
}) {
  const [hi, setHi] = useState<string | null>(null);
  const x = (v: number) => `${Math.max(0, Math.min(1, v)) * 100}%`;
  return (
    <div className="vc-db" role="group" aria-label={ariaLabel} onPointerLeave={e => { if (e.pointerType === 'mouse') setHi(null); }}>
      <div className="vc-db-axis" aria-hidden="true">{[0, 0.25, 0.5, 0.75, 1].map(t => <span key={t} style={{ left: x(t) }}>{Math.round(t * 100)}%</span>)}</div>
      {rows.map(r => {
        const lo = Math.min(r.a, r.b), hiV = Math.max(r.a, r.b);
        return (
          <div key={r.key} className={`vc-db-row ${hi && hi !== r.key ? 'is-dim' : ''}`} tabIndex={0}
            onPointerEnter={() => setHi(r.key)} onPointerDown={() => setHi(r.key)} onFocus={() => setHi(r.key)} onBlur={() => setHi(null)}>
            <b className="vc-db-label">{r.label}</b>
            <div className="vc-db-track">
              {[0.25, 0.5, 0.75].map(t => <i key={t} className="vc-row-grid" style={{ left: x(t) }} aria-hidden="true" />)}
              <span className="vc-db-bar" style={{ left: x(lo), width: `${(hiV - lo) * 100}%`, '--c': r.color } as CSSProperties} />
              <span className="vc-db-dot is-a" style={{ left: x(r.a), '--c': r.color } as CSSProperties} title={`${aLabel} ${pct(r.a)}`} />
              <span className="vc-db-dot is-b" style={{ left: x(r.b), '--c': r.color } as CSSProperties} title={`${bLabel} ${pct(r.b)}`} />
              {hi === r.key && <span className="vc-db-val" style={{ left: x(hiV) }}>{aLabel} {pct(r.a)} · {bLabel} {pct(r.b)}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 桑基：首页由滚动进度驱动描线（--vc-p），看板里进入视口时描一次           */
/* ------------------------------------------------------------------ */
export type Timing = [start: number, duration: number];

export function Sankey({ nodes, links, height, ariaLabel, linkPaint, nodePaint, timing, compact = false, marginL, marginR }: {
  nodes: FlowNode[];
  links: FlowLink[];
  height: number;
  ariaLabel: string;
  /** 返回颜色；返回 'hatch' 时用主色斜纹（待付） */
  linkPaint: (l: FlowLink, source: FlowNode, target: FlowNode) => string;
  nodePaint: (n: FlowNode) => string;
  /** 滚动叙事用：每个节点 / 连线在 --vc-p 上的起点和时长 */
  timing?: { node: (n: FlowNode, i: number) => Timing; link: (l: FlowLink, i: number, source: FlowNode) => Timing };
  compact?: boolean;
  marginL?: number;
  marginR?: number;
}) {
  const { fx } = useSite();
  const uid = useId().replace(/:/g, '');
  const wrap = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const { width } = useSize(wrap);
  const [hi, setHi] = useState<{ kind: 'node' | 'link'; id: string } | null>(null);
  const ml = marginL ?? (compact ? 64 : 104), mr = marginR ?? (compact ? 82 : 128);
  const lay = useMemo(() => (width > 0 && nodes.length
    ? layoutSankey(nodes, links, { width: Math.max(40, width - ml - mr), height: height - 16, nodeWidth: compact ? 8 : 10, gap: compact ? 12 : 18 })
    : null), [nodes, links, width, height, ml, mr, compact]);
  const byId = useMemo(() => new Map((lay?.nodes ?? []).map(n => [n.id, n])), [lay]);
  const colTotal = useMemo(() => {
    const t = new Map<number, number>();
    nodes.forEach(n => t.set(n.column, (t.get(n.column) ?? 0) + n.value));
    return t;
  }, [nodes]);

  // 看板模式：进入视口时把 --vc-p 从 0 播到 1（@property 注册过，可插值）
  useEnter(svgRef, el => [el.animate([{ '--vc-p': 0 }, { '--vc-p': 1 }] as Keyframe[], { duration: 1600, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'backwards' })], { enabled: fx.motion && !timing, ready: !!lay });

  const related = (l: FlowLink) => !hi || (hi.kind === 'link' ? `${l.source}|${l.target}` === hi.id : l.source === hi.id || l.target === hi.id);
  const nodeRelated = (id: string) => !hi || (hi.kind === 'node' ? hi.id === id : hi.id.split('|').includes(id));

  let tip: ReactNode = null, tipX = 0, tipY = 0;
  if (hi && lay) {
    if (hi.kind === 'link') {
      const l = lay.links.find(x => `${x.source}|${x.target}` === hi.id);
      if (l) {
        const s = byId.get(l.source)!, t = byId.get(l.target)!;
        tipX = ml + (s.x + s.w + t.x) / 2; tipY = 8 + (l.sy + l.ty) / 2;
        tip = <><p className="vc-tip-h">{s.label} → {t.label}</p><p className="vc-tip-row">金额<b>{wan(l.value)} 万元</b></p><p className="vc-tip-row">占来源<b>{pct(l.value / s.value)}</b></p></>;
      }
    } else {
      const n = byId.get(hi.id);
      if (n) {
        tipX = ml + n.x + n.w / 2; tipY = 8 + n.y + n.h / 2;
        tip = <><p className="vc-tip-h">{n.label}</p><p className="vc-tip-row">金额<b>{wan(n.value)} 万元</b></p><p className="vc-tip-row">占本列<b>{pct(n.value / (colTotal.get(n.column) || 1))}</b></p></>;
      }
    }
  }

  return (
    <div className={`vc-sankey ${compact ? 'is-compact' : ''}`} ref={wrap} style={{ height }} onPointerLeave={e => { if (e.pointerType === 'mouse') setHi(null); }}>
      {lay && (
        <svg ref={svgRef} width={width} height={height} role="img" aria-label={ariaLabel}>
          <defs>
            <pattern id={`${uid}-hatch`} patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)">
              <rect width="7" height="7" style={{ fill: 'rgb(var(--accent-rgb) / .14)' }} />
              <line x1="1.5" y1="0" x2="1.5" y2="7" style={{ stroke: 'rgb(var(--accent-rgb) / .75)', strokeWidth: 2.2 }} />
            </pattern>
          </defs>
          <g transform={`translate(${ml},8)`}>
            {lay.links.map((l, i) => {
              const s = byId.get(l.source)!, t = byId.get(l.target)!;
              const paint = linkPaint(l, s, t);
              const [st, du] = timing ? timing.link(l, i, s) : [Math.min(0.5, i * 0.03), 0.5];
              return (
                <path key={`${l.source}|${l.target}`} d={l.path} pathLength={1}
                  className={`vc-sk-link ${related(l) ? '' : 'is-dim'} ${hi?.kind === 'link' && hi.id === `${l.source}|${l.target}` ? 'is-on' : ''}`}
                  style={{ stroke: paint === 'hatch' ? `url(#${uid}-hatch)` : paint, strokeWidth: Math.max(1, l.width), '--vc-s': st, '--vc-d': du } as CSSProperties}
                  onPointerEnter={() => setHi({ kind: 'link', id: `${l.source}|${l.target}` })}
                  onPointerDown={() => setHi({ kind: 'link', id: `${l.source}|${l.target}` })} />
              );
            })}
            {lay.nodes.map((n, i) => {
              const [st, du] = timing ? timing.node(n, i) : [n.column * 0.25, 0.3];
              // 第一列标签放左侧，其余列放右侧（中间列压在连线上，靠描边光晕保证可读）
              const lx = n.column === 0 ? n.x - 10 : n.x + n.w + 10;
              const anchor = n.column === 0 ? 'end' : 'start';
              return (
                <g key={n.id} className={`vc-sk-node ${nodeRelated(n.id) ? '' : 'is-dim'}`} style={{ '--vc-s': st, '--vc-d': du } as CSSProperties}
                  onPointerEnter={() => setHi({ kind: 'node', id: n.id })} onPointerDown={() => setHi({ kind: 'node', id: n.id })}>
                  <rect x={n.x} y={n.y} width={n.w} height={n.h} className="vc-sk-rect" style={{ fill: nodePaint(n) }} />
                  <rect x={n.x - 6} y={n.y} width={n.w + 12} height={Math.max(n.h, 14)} className="vc-hit" />
                  <text x={lx} y={n.y + n.h / 2} textAnchor={anchor} className="vc-sk-label">
                    <tspan x={lx} dy={compact ? '-0.15em' : '-0.2em'}>{n.label}</tspan>
                    <tspan x={lx} dy="1.25em" className="vc-sk-val">{wan(n.value, 0)} 万</tspan>
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      )}
      {tip && <Tip x={tipX} y={tipY} width={width}>{tip}</Tip>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 型号小多图：共用 y 轴上限，便于横向比较                                */
/* ------------------------------------------------------------------ */
export interface MultipleItem { id: string; title: string; sub: string; color: string; values: number[]; values2?: number[]; foot: ReactNode }

function MiniChart({ item, labels, max, kind, label2 }: { item: MultipleItem; labels: string[]; max: number; kind: 'area' | 'columns'; label2?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { width } = useSize(ref);
  const { hi, setHi, onKey } = useIndexHover(labels.length);
  const h = 132, m = { t: 10, r: 6, b: 22, l: 6 };
  const iw = Math.max(10, width - m.l - m.r), ih = h - m.t - m.b;
  const y = scaleLinear([0, max], [m.t + ih, m.t]);
  const step = labels.length ? iw / labels.length : 0;
  const xs = labels.map((_, i) => (kind === 'area' ? m.l + (labels.length <= 1 ? iw / 2 : (i * iw) / (labels.length - 1)) : m.l + i * step + step / 2));
  const bw = Math.min(24, step * 0.5);
  const onMove = (e: PointerEvent<SVGSVGElement>) => { const r = e.currentTarget.getBoundingClientRect(); setHi(nearestIndex(xs, e.clientX - r.left)); };
  const pts: Pt[] = item.values.map((v, i) => [xs[i], y(v)]);
  return (
    <div className="vc-sm-chart" ref={ref}>
      <p className="vc-sm-read" aria-live="polite">
        {hi === null ? <span>悬停查看各月</span> : <><span>{labels[hi]}</span><b>{wan(item.values[hi] ?? 0, 0)} 万</b>{item.values2 && <em>{label2} {wan(item.values2[hi] ?? 0, 0)} 万</em>}</>}
      </p>
      {width > 0 && (
        <svg width={width} height={h} role="img" aria-label={`${item.title} 各月数值`} tabIndex={0} onPointerMove={onMove} onPointerDown={onMove}
          onPointerLeave={e => { if (e.pointerType === 'mouse') setHi(null); }} onKeyDown={onKey} onBlur={() => setHi(null)}>
          <line x1={m.l} x2={width - m.r} y1={m.t + ih} y2={m.t + ih} className="vc-base" />
          <line x1={m.l} x2={width - m.r} y1={y(max / 2)} y2={y(max / 2)} className="vc-grid" />
          {kind === 'area' ? (
            <>
              <path d={areaPath(pts, m.t + ih)} className="vc-sm-area" style={{ fill: item.color }} />
              <path d={smoothPath(pts)} className="vc-line" style={{ stroke: item.color }} />
            </>
          ) : item.values.map((v, i) => (
            <Fragment key={i}>
              <path d={barPath(xs[i] - bw / 2, y(v), bw, m.t + ih - y(v), 4)} className={`vc-bar is-light ${hi !== null && hi !== i ? 'is-dim' : ''}`} style={{ '--c': item.color } as CSSProperties} />
              {item.values2 && <path d={barPath(xs[i] - bw / 2, y(item.values2[i] ?? 0), bw, m.t + ih - y(item.values2[i] ?? 0), 4)} className={`vc-bar ${hi !== null && hi !== i ? 'is-dim' : ''}`} style={{ '--c': item.color } as CSSProperties} />}
            </Fragment>
          ))}
          {labels.map((l, i) => (i === 0 || i === labels.length - 1 || hi === i) && <text key={i} x={xs[i]} y={h - 6} className={`vc-axis ${hi === i ? 'is-on' : ''}`} textAnchor={i === 0 && hi !== i ? 'start' : i === labels.length - 1 && hi !== i ? 'end' : 'middle'}>{l}</text>)}
          {hi !== null && kind === 'area' && <g className="vc-cross"><line x1={xs[hi]} x2={xs[hi]} y1={m.t} y2={m.t + ih} /><circle cx={xs[hi]} cy={y(item.values[hi] ?? 0)} r={4} style={{ stroke: item.color }} /></g>}
        </svg>
      )}
    </div>
  );
}

export function SmallMultiples({ items, labels, kind, label2, ariaLabel }: { items: MultipleItem[]; labels: string[]; kind: 'area' | 'columns'; label2?: string; ariaLabel: string }) {
  const max = niceMax(Math.max(1, ...items.flatMap(i => [...i.values, ...(i.values2 ?? [])])), 2);
  return (
    <div className="vc-sm" role="group" aria-label={ariaLabel}>
      {items.map(it => (
        <article key={it.id} className="vc-sm-item">
          <header><i className="vc-sm-sw" style={{ background: it.color }} aria-hidden="true" /><h3>{it.title}</h3><span>{it.sub}</span></header>
          <MiniChart item={it} labels={labels} max={max} kind={kind} label2={label2} />
          <div className="vc-sm-foot">{it.foot}</div>
        </article>
      ))}
      <p className="vc-sm-scale vc-mono">同一刻度 · 上限 {wan(max, 0)} 万元</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 预览用的迷你图（跟随鼠标的预览卡里）                                  */
/* ------------------------------------------------------------------ */
export function MiniLine({ values, color = 'var(--accent)', w = 232, h = 84 }: { values: number[]; color?: string; w?: number; h?: number }) {
  if (!values.length) return null;
  const max = Math.max(1, ...values);
  const xs = values.map((_, i) => 4 + (i * (w - 8)) / Math.max(1, values.length - 1));
  const pts: Pt[] = values.map((v, i) => [xs[i], h - 6 - ((h - 16) * v) / max]);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="vc-mini">
      <line x1="0" x2={w} y1={h - 6} y2={h - 6} className="vc-base" />
      <path d={areaPath(pts, h - 6)} style={{ fill: color, opacity: 0.12 }} />
      <path d={smoothPath(pts)} className="vc-line" style={{ stroke: color }} />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3.5" style={{ fill: color }} />
    </svg>
  );
}

export function MiniBars({ rows, w = 232 }: { rows: { label: string; value: number; color?: string }[]; w?: number }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return (
    <div className="vc-minibars" style={{ width: w }} aria-hidden="true">
      {rows.map(r => (
        <div key={r.label}>
          <span>{r.label}</span>
          <i><b style={{ width: `${(r.value / max) * 100}%`, background: r.color ?? 'var(--vc-ink)' }} /></i>
          <em>{wan(r.value, 0)}</em>
        </div>
      ))}
    </div>
  );
}

