import { useId, useRef, useState, type PointerEvent } from 'react';
import { useElementSize } from '../../../core/fx/hooks';
import { useSite } from '../../../core/provider';
import { areaPath, nearestIndex, niceMax, scaleLinear, smoothPath, type Pt } from '../../../core/charts/scale';
import { useReveal } from '../lib';
import { Tip, TipRow, useKeyNav, useOutsideClear } from './common';

export interface LineSeries { key: string; label: string; color: string; values: number[]; area?: boolean; dashed?: boolean }

/**
 * 折线 / 面积图：一根数值轴，2px 线，十字线 + 提示框，键盘方向键可逐点查看。
 * glow=true 时在线下面叠一层模糊的同色线（发光折线）。
 * focus：要强调的横轴 key，会在该点画一个标注。
 */
export function LineChart({ labels, keys, series, height = 260, fmt, axisFmt, ariaLabel, glow = false, focus, pulse }: {
  labels: string[];
  keys?: string[];
  series: LineSeries[];
  height?: number;
  fmt: (v: number) => string;
  axisFmt?: (v: number) => string;
  ariaLabel: string;
  glow?: boolean;
  focus?: string | null;
  /** 在该系列的末端画一个脉冲点 */
  pulse?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(wrap);
  const drawn = useReveal(wrap);
  const { fx } = useSite();
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  useOutsideClear(wrap, hover !== null, () => setHover(null));

  const m = { l: 46, r: 14, t: 16, b: 30 };
  const w = Math.max(160, width);
  const h = height;
  const max = niceMax(Math.max(1, ...series.flatMap(s => s.values)), 4);
  const y = scaleLinear([0, max], [h - m.b, m.t]);
  const n = labels.length;
  const xs = labels.map((_, i) => (n <= 1 ? (m.l + w - m.r) / 2 : m.l + (i * (w - m.l - m.r)) / (n - 1)));
  const ticks = y.ticks(4);
  const focusIdx = focus && keys ? keys.indexOf(focus) : -1;
  const shown = hover ?? (focusIdx >= 0 ? focusIdx : null);
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * w;
    setHover(nearestIndex(xs, px));
  };
  const onKey = useKeyNav(n, hover, setHover);
  const animate = drawn && fx.motion;
  const tipY = shown !== null ? Math.min(...series.map(s => y(s.values[shown] ?? 0))) : 0;

  return (
    <div ref={wrap} className="vb-chart" role="group" tabIndex={0} onKeyDown={onKey} onBlur={() => setHover(null)} aria-label={`${ariaLabel}。用左右方向键逐点查看。`}>
      {width > 0 && (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={ariaLabel} className={animate ? 'is-drawing' : undefined}
          onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={e => { if (e.pointerType === 'mouse') setHover(null); }}>
          <defs>
            {glow && <filter id={`gl${uid}`} x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="5" /></filter>}
            {series.filter(s => s.area).map(s => (
              <linearGradient key={s.key} id={`ar${uid}${s.key.replace(/[^a-zA-Z0-9]/g, '')}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" style={{ stopColor: s.color, stopOpacity: 0.22 }} />
                <stop offset="1" style={{ stopColor: s.color, stopOpacity: 0 }} />
              </linearGradient>
            ))}
          </defs>
          <g className="vb-grid">
            {ticks.map(t => <line key={t} x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} />)}
          </g>
          <g className="vb-axis">
            {ticks.map(t => <text key={t} x={m.l - 8} y={y(t)} dy="0.32em" textAnchor="end">{(axisFmt ?? fmt)(t)}</text>)}
            {labels.map((l, i) => <text key={l + i} x={xs[i]} y={h - 8} textAnchor="middle" className={shown === i ? 'is-on' : undefined}>{l}</text>)}
          </g>
          {series.map((s, si) => {
            const pts: Pt[] = s.values.map((v, i) => [xs[i], y(v)]);
            const d = smoothPath(pts);
            return (
              <g key={s.key} className="vb-series" style={{ ['--i' as string]: si }}>
                {s.area && <path className="vb-area" d={areaPath(pts, h - m.b)} fill={`url(#ar${uid}${s.key.replace(/[^a-zA-Z0-9]/g, '')})`} />}
                {glow && <path className="vb-line vb-line-glow" d={d} pathLength={1} style={{ stroke: s.color }} filter={`url(#gl${uid})`} />}
                <path className="vb-line" d={d} pathLength={1} style={{ stroke: s.color }} strokeDasharray={s.dashed ? '4 4' : undefined} />
                {pulse === s.key && pts.length > 0 && (
                  <g transform={`translate(${pts[pts.length - 1][0]},${pts[pts.length - 1][1]})`}>
                    <circle className="vb-pulse" r={9} style={{ fill: s.color }} />
                    <circle r={3.5} style={{ fill: s.color }} stroke="var(--vb-surface)" strokeWidth={1.5} />
                  </g>
                )}
              </g>
            );
          })}
          {shown !== null && (
            <g className="vb-cross" pointerEvents="none">
              <line x1={xs[shown]} x2={xs[shown]} y1={m.t} y2={h - m.b} />
              {series.map(s => <circle key={s.key} cx={xs[shown]} cy={y(s.values[shown] ?? 0)} r={4.5} style={{ stroke: s.color }} />)}
            </g>
          )}
        </svg>
      )}
      {shown !== null && width > 0 && (
        <Tip x={xs[shown]} y={tipY - 12} width={w}>
          <div className="vb-tip-title">{labels[shown]}</div>
          {series.map(s => <TipRow key={s.key} color={s.color} kind="line" label={s.label} value={fmt(s.values[shown] ?? 0)} />)}
        </Tip>
      )}
    </div>
  );
}
