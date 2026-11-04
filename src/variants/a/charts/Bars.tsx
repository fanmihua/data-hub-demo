import { useRef, useState, type ReactNode } from 'react';

import { barPath, niceMax, ringPath, scaleBand, scaleLinear } from '../../../core/charts/scale';
import { pct, wan, wanLabel } from '../../../core/data/format';
import { useReveal, useSize } from '../lib';
import { Tip, TipRow } from './kit';

export interface BarSeries { id: string; label: string; color: string; /** 0–100，按比例和透明混合，用来区分同色系列 */ mix?: number }

const fillOf = (base: string, mix?: number) => (mix != null && mix < 100 ? `color-mix(in srgb, ${base} ${mix}%, transparent)` : base);
export interface BarRow { key: string; label: string; sub?: string; values: number[]; color?: string }

/**
 * 横向柱（子弹图式）：第 0 个系列是浅色底条，后面的系列叠在里面。
 * 每行标签在上、数值在右。柱厚 ≤ 20px，数据端 4px 圆角、基线端直角。
 */
export function HBars({ rows, series, ariaLabel, max, rowNote, format = wanLabel, valueText }: {
  rows: BarRow[];
  series: BarSeries[];
  ariaLabel: string;
  max?: number;
  rowNote?: (row: BarRow) => ReactNode;
  format?: (v: number) => string;
  valueText?: (row: BarRow) => string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const { width } = useSize(box);
  const [svgRef, played] = useReveal<SVGSVGElement>(0.3);
  const [hover, setHover] = useState<{ i: number; s: number; x: number; y: number } | null>(null);
  const W = Math.max(width, 160);
  const rowH = 50, barH = 14;
  const H = rows.length * rowH + 4;
  const top = Math.max(1, max ?? Math.max(...rows.flatMap(r => r.values)));
  const x = scaleLinear([0, top], [0, W - 1]);

  return (
    <div ref={box} className="va-chart va-hbars" style={{ height: H }} onPointerLeave={() => setHover(null)}>
      {width > 0 && (
        <svg ref={svgRef} width={W} height={H} role="img" aria-label={ariaLabel} className={`va-svg${played ? ' is-played' : ''}`}>
          {rows.map((r, i) => {
            const y0 = i * rowH;
            const by = y0 + 26;
            return (
              <g key={r.key} className={`va-hbar-row${hover && hover.i !== i ? ' is-dim' : ''}`}>
                <text x={0} y={y0 + 14} className="va-bar-label">{r.label}{r.sub ? <tspan className="va-bar-sub" dx={8}>{r.sub}</tspan> : null}</text>
                <text x={W} y={y0 + 14} textAnchor="end" className="va-bar-value va-num">{valueText ? valueText(r) : format(r.values[0])}</text>
                <rect x={0} y={by} width={W} height={barH} rx={0} className="va-bar-track" />
                {series.map((s, k) => {
                  const v = r.values[k] ?? 0;
                  const w = Math.max(0, x(v));
                  const inset = k === 0 ? 0 : 3;
                  return (
                    <path key={s.id} d={barPath(0, by + inset, w, barH - inset * 2, k === 0 ? 4 : 3, true)}
                      className="va-bar va-bar-h" style={{ fill: fillOf(r.color ?? s.color, s.mix), transitionDelay: `${i * 70 + k * 120}ms` }}
                      onPointerMove={e => { const b = box.current!.getBoundingClientRect(); setHover({ i, s: k, x: e.clientX - b.left, y: e.clientY - b.top }); }}
                      onPointerDown={e => { const b = box.current!.getBoundingClientRect(); setHover({ i, s: k, x: e.clientX - b.left, y: e.clientY - b.top }); }} />
                  );
                })}
                <rect x={0} y={y0} width={W} height={rowH} fill="transparent" className="va-hit"
                  onPointerMove={e => { const b = box.current!.getBoundingClientRect(); setHover(h => (h && h.i === i ? { ...h, x: e.clientX - b.left, y: e.clientY - b.top } : { i, s: -1, x: e.clientX - b.left, y: e.clientY - b.top })); }}
                  onPointerDown={e => { const b = box.current!.getBoundingClientRect(); setHover({ i, s: -1, x: e.clientX - b.left, y: e.clientY - b.top }); }} />
              </g>
            );
          })}
        </svg>
      )}
      {hover && rows[hover.i] && (
        <Tip x={hover.x} y={hover.y} width={W} height={H}>
          <p className="va-tip-title">{rows[hover.i].label}</p>
          {series.map((s, k) => <TipRow key={s.id} color={fillOf(rows[hover.i].color ?? s.color, s.mix)} label={s.label} value={format(rows[hover.i].values[k] ?? 0)} />)}
          {rowNote ? <div className="va-tip-note">{rowNote(rows[hover.i])}</div> : null}
        </Tip>
      )}
    </div>
  );
}

/** 纵向分组柱：每组若干系列并排，单根柱悬停。 */
export function VBars({ labels, series, values, ariaLabel, height = 280, format = wanLabel }: {
  labels: string[];
  series: BarSeries[];
  /** values[series][i] */
  values: number[][];
  ariaLabel: string;
  height?: number;
  format?: (v: number) => string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const { width } = useSize(box);
  const [svgRef, played] = useReveal<SVGSVGElement>(0.3);
  const [hover, setHover] = useState<{ i: number; k: number } | null>(null);
  const W = Math.max(width, 160), H = height;
  const m = { l: W < 480 ? 40 : 52, r: 8, t: 22, b: 30 };
  const peak = Math.max(1, ...values.flat());
  const y = scaleLinear([0, niceMax(peak * 1.04, 4)], [H - m.b, m.t]);
  const band = scaleBand(labels, [m.l, W - m.r], 0.36);
  const gap = 4;
  const bw = Math.min(24, (band.bandwidth - gap * (series.length - 1)) / series.length);
  const groupW = bw * series.length + gap * (series.length - 1);

  const pos = (i: number, k: number) => band(labels[i]) + (band.bandwidth - groupW) / 2 + k * (bw + gap);

  return (
    <div ref={box} className="va-chart" style={{ height: H }} onPointerLeave={() => setHover(null)}>
      {width > 0 && (
        <svg ref={svgRef} width={W} height={H} role="img" aria-label={ariaLabel} className={`va-svg${played ? ' is-played' : ''}`}>
          {y.ticks(4).map(t => (
            <g key={t} aria-hidden="true">
              <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} className={t === 0 ? 'va-axis' : 'va-gridline'} />
              <text x={m.l - 10} y={y(t)} dy="0.32em" textAnchor="end" className="va-tick">{wan(t, 0)}</text>
            </g>
          ))}
          <text x={m.l - 10} y={m.t - 10} textAnchor="end" className="va-tick va-tick-unit" aria-hidden="true">万元</text>
          {labels.map((l, i) => (
            <g key={l}>
              <text x={band(l) + band.bandwidth / 2} y={H - 8} textAnchor="middle" className={`va-tick${hover?.i === i ? ' is-on' : ''}`}>{l}</text>
              {series.map((s, k) => {
                const v = values[k][i] ?? 0;
                const h = Math.max(0, y(0) - y(v));
                const on = hover && hover.i === i && hover.k === k;
                return (
                  <g key={s.id}>
                    <path d={barPath(pos(i, k), y(v), bw, h, 4)}
                      className={`va-bar va-bar-v${hover && !on ? ' is-dim' : ''}`} style={{ fill: fillOf(s.color, s.mix), transitionDelay: `${i * 60 + k * 90}ms` }} />
                    <rect x={pos(i, k) - gap / 2} y={m.t} width={bw + gap} height={y(0) - m.t} fill="transparent" className="va-hit"
                      onPointerMove={() => setHover({ i, k })} onPointerDown={() => setHover({ i, k })} />
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
      )}
      {hover && (
        <Tip x={pos(hover.i, hover.k) + bw / 2} y={Math.min(y(values[hover.k][hover.i] ?? 0), H - m.b - 30)} width={W} height={H}>
          <p className="va-tip-title">{labels[hover.i]} · {series[hover.k].label}</p>
          <TipRow color={fillOf(series[hover.k].color, series[hover.k].mix)} label={series[hover.k].label} value={format(values[hover.k][hover.i] ?? 0)} />
          {series.map((s, k) => k !== hover.k && <TipRow key={s.id} color={fillOf(s.color, s.mix)} label={s.label} value={format(values[k][hover.i] ?? 0)} />)}
        </Tip>
      )}
    </div>
  );
}

/** 环形图：扇区单独悬停，中心显示合计或悬停项 */
export function Ring({ items, ariaLabel, size = 200, centerLabel }: {
  items: { key: string; label: string; value: number; color: string }[];
  ariaLabel: string;
  size?: number;
  centerLabel: string;
}) {
  const [svgRef, played] = useReveal<SVGSVGElement>(0.3);
  const [hover, setHover] = useState<number | null>(null);
  const total = items.reduce((s, x) => s + x.value, 0) || 1;
  const c = size / 2, r1 = size / 2 - 6, r0 = r1 - 22;
  let a = 0;
  const arcs = items.map(it => {
    const a0 = a, a1 = a + (it.value / total) * Math.PI * 2;
    a = a1;
    return { ...it, a0, a1 };
  });
  const cur = hover !== null ? arcs[hover] : null;
  return (
    <div className="va-ring" onPointerLeave={() => setHover(null)}>
      <div className="va-ring-fig" style={{ width: size, height: size }}>
        <svg ref={svgRef} width={size} height={size} role="img" aria-label={ariaLabel} className={`va-svg${played ? ' is-played' : ''}`}>
          {arcs.map((s, i) => (
            <path key={s.key} d={ringPath(c, c, r0, hover === i ? r1 + 4 : r1, s.a0 + 0.012, Math.max(s.a0 + 0.013, s.a1 - 0.012))}
              className={`va-ring-seg${hover !== null && hover !== i ? ' is-dim' : ''}`} style={{ fill: s.color, transitionDelay: `${i * 90}ms` }}
              onPointerMove={() => setHover(i)} onPointerDown={() => setHover(i)} />
          ))}
        </svg>
        <div className="va-ring-center" aria-hidden="true">
          <span className="va-mono">{cur ? cur.label : centerLabel}</span>
          <b className="va-num">{wan(cur ? cur.value : total)}<small>万元</small></b>
          {cur && <span className="va-ring-share">{pct(cur.value / total)}</span>}
        </div>
      </div>
      <ul className="va-ring-list">
        {arcs.map((s, i) => (
          <li key={s.key} className={hover === i ? 'is-on' : ''} onPointerEnter={() => setHover(i)}>
            <i style={{ background: s.color }} aria-hidden="true" />
            <span>{s.label}</span>
            <b className="va-num">{wanLabel(s.value)}</b>
            <em className="va-num">{pct(s.value / total)}</em>
          </li>
        ))}
      </ul>
    </div>
  );
}
