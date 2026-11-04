import { useRef, useState, type ReactNode } from 'react';
import { useElementSize } from '../../../core/fx/hooks';
import { useSite } from '../../../core/provider';
import { barPath, niceMax, scaleBand, scaleLinear } from '../../../core/charts/scale';
import { useReveal } from '../lib';
import { Tip, TipRow, useKeyNav, useOutsideClear } from './common';

export interface BarSeries { key: string; label: string; color: string; values: number[] }

/**
 * 竖向分组柱：柱宽 ≤ 24px，数据端 4px 圆角、基线端直角；单根柱悬停。
 * focus：要强调的分组 key（其余分组变淡）。
 */
export function BarChart({ labels, keys, series, height = 260, fmt, axisFmt, ariaLabel, focus }: {
  labels: string[];
  keys: string[];
  series: BarSeries[];
  height?: number;
  fmt: (v: number) => string;
  axisFmt?: (v: number) => string;
  ariaLabel: string;
  focus?: string | null;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(wrap);
  const drawn = useReveal(wrap);
  const { fx } = useSite();
  const [hover, setHover] = useState<number | null>(null);
  useOutsideClear(wrap, hover !== null, () => setHover(null));

  const m = { l: 46, r: 10, t: 16, b: 30 };
  const w = Math.max(160, width), h = height;
  const max = niceMax(Math.max(1, ...series.flatMap(s => s.values)), 4);
  const y = scaleLinear([0, max], [h - m.b, m.t]);
  const band = scaleBand(keys, [m.l, w - m.r], 0.3);
  const ns = series.length, gap = ns > 1 ? 3 : 0;
  const bw = Math.max(4, Math.min(24, (band.bandwidth - gap * (ns - 1)) / ns));
  const groupW = bw * ns + gap * (ns - 1);
  const bars = keys.flatMap((k, gi) => series.map((s, si) => {
    const v = s.values[gi] ?? 0;
    const x = band(k) + (band.bandwidth - groupW) / 2 + si * (bw + gap);
    return { gi, si, k, s, v, x, y: y(v), hgt: h - m.b - y(v) };
  }));
  const onKey = useKeyNav(bars.length, hover, setHover);
  const hb = hover !== null ? bars[hover] : null;
  const animate = drawn && fx.motion;

  return (
    <div ref={wrap} className="vb-chart" role="group" tabIndex={0} onKeyDown={onKey} onBlur={() => setHover(null)} aria-label={`${ariaLabel}。用方向键逐根查看。`}>
      {width > 0 && (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={ariaLabel} className={animate ? 'is-drawing' : undefined}
          onPointerLeave={e => { if (e.pointerType === 'mouse') setHover(null); }}>
          <g className="vb-grid">{y.ticks(4).map(t => <line key={t} x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} />)}</g>
          <g className="vb-axis">
            {y.ticks(4).map(t => <text key={t} x={m.l - 8} y={y(t)} dy="0.32em" textAnchor="end">{(axisFmt ?? fmt)(t)}</text>)}
            {keys.map((k, i) => <text key={k} x={band(k) + band.bandwidth / 2} y={h - 8} textAnchor="middle" className={hb?.gi === i || focus === k ? 'is-on' : undefined}>{labels[i]}</text>)}
          </g>
          {bars.map((b, i) => {
            const dim = (hb && hover !== i) || (focus && b.k !== focus && !hb);
            return (
              <g key={`${b.k}-${b.s.key}`}>
                <path className={`vb-bar${dim ? ' is-dim' : ''}`} d={barPath(b.x, b.y, bw, b.hgt, 4)} style={{ fill: b.s.color, ['--i' as string]: i }} />
                <rect className="vb-hit" x={b.x - gap / 2} y={m.t} width={bw + gap} height={h - m.b - m.t}
                  onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} />
              </g>
            );
          })}
          <line className="vb-baseline" x1={m.l} x2={w - m.r} y1={h - m.b} y2={h - m.b} />
        </svg>
      )}
      {hb && (
        <Tip x={hb.x + bw / 2} y={hb.y - 10} width={w}>
          <div className="vb-tip-title">{labels[hb.gi]}</div>
          <TipRow color={hb.s.color} kind="dot" label={hb.s.label} value={fmt(hb.v)} />
        </Tip>
      )}
    </div>
  );
}

export interface HBarItem {
  key: string;
  label: ReactNode;
  /** 主值（外层条） */
  value: number;
  /** 内层（例如已付），画在主值条内 */
  inner?: number;
  /** 背景轨道（例如合同额） */
  track?: number;
  color: string;
  display: string;
  detail?: ReactNode;
}

/**
 * 横向条：每行 标签 | 条 | 数值。条高 14px，右端 4px 圆角、左端直角。
 * 可叠三层：轨道（track）、外层（value）、内层（inner）。单行悬停显示详情。
 */
export function HBars({ items, ariaLabel, focus, max: maxIn }: { items: HBarItem[]; ariaLabel: string; focus?: string | null; max?: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const drawn = useReveal(wrap);
  const { fx } = useSite();
  const [hover, setHover] = useState<number | null>(null);
  useOutsideClear(wrap, hover !== null, () => setHover(null));
  const max = maxIn ?? Math.max(1, ...items.map(it => Math.max(it.value, it.track ?? 0)));
  const onKey = useKeyNav(items.length, hover, setHover);
  return (
    <div ref={wrap} className={`vb-hbars${drawn && fx.motion ? ' is-drawing' : ''}`} role="group" tabIndex={0} aria-label={`${ariaLabel}。用方向键逐行查看。`} onKeyDown={onKey} onBlur={() => setHover(null)}
      onPointerLeave={e => { if (e.pointerType === 'mouse') setHover(null); }}>
      <ul aria-label={ariaLabel}>
        {items.map((it, i) => {
          const dim = (hover !== null && hover !== i) || (focus && focus !== it.key && hover === null);
          return (
            <li key={it.key} className={`${dim ? 'is-dim' : ''}${hover === i || focus === it.key ? ' is-on' : ''}`} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} style={{ ['--i' as string]: i }}>
              <span className="vb-hb-label">{it.label}</span>
              <span className="vb-hb-track">
                {it.track !== undefined && <i className="vb-hb-bg" style={{ width: `${(it.track / max) * 100}%` }} />}
                <i className="vb-hb-bar" style={{ width: `${(it.value / max) * 100}%`, background: it.color, opacity: it.inner !== undefined ? 0.32 : 1 }} />
                {it.inner !== undefined && <i className="vb-hb-bar is-inner" style={{ width: `${(it.inner / max) * 100}%`, background: it.color }} />}
              </span>
              <span className="vb-hb-val">{it.display}</span>
              {hover === i && it.detail && <span className="vb-hb-detail" role="status">{it.detail}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
