import { useRef, useState, type PointerEvent } from 'react';

import { areaPath, bandPath, nearestIndex, niceMax, scaleLinear, smoothPath, type Pt } from '../../../core/charts/scale';
import { wan, wanLabel } from '../../../core/data/format';
import { useReveal, useSize } from '../lib';
import { Tip, TipRow } from './kit';

export interface TimeSeries { id: string; label: string; color: string; values: number[] }

/**
 * 时间序列图：堆叠面积（stack）或多折线（lines），一根数值轴。
 * 悬停 / 触控：十字线 + 提示框。首次进入视口时描线，面积从淡色静止状态补全。
 */
export function TimeChart({ labels, series, mode = 'stack', reference, height = 280, ariaLabel, format = wanLabel, totalLabel = '合计', endLabel, extraRows }: {
  labels: string[];
  series: TimeSeries[];
  mode?: 'stack' | 'lines';
  reference?: { value: number; label: string };
  height?: number;
  ariaLabel: string;
  format?: (v: number) => string;
  totalLabel?: string;
  /** 在最后一个点旁直接标注（堆叠时标合计，折线时标最高的一条） */
  endLabel?: (v: number) => string;
  extraRows?: (i: number) => { label: string; value: string }[];
}) {
  const box = useRef<HTMLDivElement>(null);
  const { width } = useSize(box);
  const [svgRef, played] = useReveal<SVGSVGElement>(0.3);
  const [hover, setHover] = useState<number | null>(null);

  const W = Math.max(width, 120);
  const H = height;
  const compact = W < 480;
  const m = { l: compact ? 40 : 52, r: compact ? 12 : 20, t: 22, b: 30 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const n = labels.length;
  const xs = labels.map((_, i) => m.l + (n <= 1 ? iw / 2 : (i * iw) / (n - 1)));

  const tops: number[][] = [];
  if (mode === 'stack') {
    series.forEach((s, k) => tops.push(s.values.map((v, i) => v + (k ? tops[k - 1][i] : 0))));
  } else series.forEach(s => tops.push(s.values));
  const totals = labels.map((_, i) => series.reduce((acc, s) => acc + (s.values[i] ?? 0), 0));
  const peak = Math.max(1, reference?.value ?? 0, ...(mode === 'stack' ? totals : series.flatMap(s => s.values)));
  const y = scaleLinear([0, niceMax(peak * 1.04, 4)], [m.t + ih, m.t]);
  const ticks = y.ticks(4);
  const base = y(0);

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const r = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect();
    setHover(nearestIndex(xs, e.clientX - r.left));
  };

  const pts = (k: number): Pt[] => xs.map((x, i) => [x, y(tops[k][i] ?? 0)]);
  const lastI = n - 1;
  let endText: { x: number; y: number; text: string } | null = null;
  if (endLabel && n) {
    if (mode === 'stack') endText = { x: xs[lastI], y: y(totals[lastI]), text: endLabel(totals[lastI]) };
    else {
      const k = series.reduce((best, s, i) => (s.values[lastI] > series[best].values[lastI] ? i : best), 0);
      endText = { x: xs[lastI], y: y(series[k].values[lastI]), text: endLabel(series[k].values[lastI]) };
    }
  }

  return (
    <div ref={box} className="va-chart" style={{ height: H }}>
      {width > 0 && (
        <svg ref={svgRef} width={W} height={H} role="img" aria-label={ariaLabel} className={`va-svg${played ? ' is-played' : ''}`}>
          <g aria-hidden="true">
            {ticks.map(t => (
              <g key={t}>
                <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} className={t === 0 ? 'va-axis' : 'va-gridline'} />
                <text x={m.l - 10} y={y(t)} dy="0.32em" textAnchor="end" className="va-tick">{wan(t, 0)}</text>
              </g>
            ))}
            <text x={m.l - 10} y={m.t - 10} textAnchor="end" className="va-tick va-tick-unit">万元</text>
            {labels.map((l, i) => (
              <text key={l + i} x={xs[i]} y={H - 8} textAnchor={i === 0 && compact ? 'start' : i === lastI && compact ? 'end' : 'middle'} className={`va-tick${hover === i ? ' is-on' : ''}`}>{l}</text>
            ))}

            {mode === 'stack' && series.map((s, k) => (
              <path key={`a${s.id}`} d={k === 0 ? areaPath(pts(0), base) : bandPath(pts(k), pts(k - 1))} style={{ fill: s.color }} className="va-area" />
            ))}
            {mode === 'lines' && series.map((s, k) => (
              <path key={`a${s.id}`} d={areaPath(pts(k), base)} style={{ fill: s.color }} className="va-area va-area-soft" />
            ))}
            {series.map((s, k) => (
              <g key={`l${s.id}`}>
                <path d={smoothPath(pts(k))} className="va-line-ghost" style={{ stroke: s.color }} />
                <path d={smoothPath(pts(k))} className="va-line va-draw" pathLength={1} style={{ stroke: s.color, transitionDelay: `${k * 120}ms` }} />
              </g>
            ))}

            {reference && (
              <g className="va-ref">
                <line x1={m.l} x2={W - m.r} y1={y(reference.value)} y2={y(reference.value)} />
                <text x={W - m.r} y={y(reference.value) - 8} textAnchor="end">{reference.label}</text>
              </g>
            )}
            {endText && hover === null && (
              <g className="va-endlabel">
                <circle cx={endText.x} cy={endText.y} r={3.5} />
                <text x={endText.x - 10} y={endText.y - 12} textAnchor="end">{endText.text}</text>
              </g>
            )}

            {hover !== null && (
              <g className="va-cross-hair">
                <line x1={xs[hover]} x2={xs[hover]} y1={m.t} y2={base} />
                {series.map((s, k) => (
                  <circle key={s.id} cx={xs[hover]} cy={y(tops[k][hover] ?? 0)} r={4.5} style={{ fill: s.color }} />
                ))}
              </g>
            )}
          </g>
          <rect x={m.l - 8} y={m.t} width={iw + 16} height={ih} fill="transparent" className="va-hit"
            onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
      )}
      {hover !== null && (
        <Tip x={xs[hover]} y={m.t + ih * 0.42} width={W} height={H}>
          <p className="va-tip-title">{labels[hover]}</p>
          {[...series].reverse().map(s => <TipRow key={s.id} color={s.color} label={s.label} value={format(s.values[hover] ?? 0)} />)}
          {mode === 'stack' && series.length > 1 && <TipRow label={totalLabel} value={format(totals[hover])} strong />}
          {extraRows?.(hover).map(r => <TipRow key={r.label} label={r.label} value={r.value} />)}
        </Tip>
      )}
    </div>
  );
}
