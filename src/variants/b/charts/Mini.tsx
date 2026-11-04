import { useRef, useState } from 'react';
import { useElementSize } from '../../../core/fx/hooks';
import { nearestIndex, smoothPath, type Pt } from '../../../core/charts/scale';
import type { AnswerChart } from '../answer';

/**
 * 回答卡片里的小图：柱、进度条或折线。数据项少，直接标数；悬停单项会提亮。
 */
export function MiniChart({ chart, colorOf }: { chart: AnswerChart; colorOf: (model?: string) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(wrap);

  if (chart.kind === 'progress') {
    return (
      <div className="vb-mini vb-mini-progress" aria-label={chart.label}>
        <p className="vb-mini-label">{chart.label}</p>
        <ul>
          {chart.items.map((it, i) => (
            <li key={it.key} className={`${it.hi ? 'is-hi' : ''}${hover === i ? ' is-on' : ''}`} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} style={{ ['--i' as string]: i }}>
              <span>{it.label}</span>
              <span className="vb-mini-track"><i style={{ width: `${Math.min(100, it.value * 100)}%`, background: colorOf(it.model) }} /></span>
              <b>{it.display}</b>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (chart.kind === 'bars') {
    const max = Math.max(1e-9, ...chart.items.map(it => it.value));
    return (
      <div className="vb-mini vb-mini-bars" aria-label={chart.label}>
        <p className="vb-mini-label">{chart.label}</p>
        <ul style={{ ['--n' as string]: chart.items.length }}>
          {chart.items.map((it, i) => (
            <li key={it.key} className={`${it.hi ? 'is-hi' : ''}${hover === i ? ' is-on' : ''}`} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} onPointerDown={() => setHover(i)} style={{ ['--i' as string]: i }}>
              <b>{it.display}</b>
              <span className="vb-mini-col"><i style={{ height: `${Math.max(2, (it.value / max) * 100)}%`, background: colorOf(it.model) }} /></span>
              <span className="vb-mini-x" title={it.label}>{it.label}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // line
  const h = 120, m = { l: 6, r: 6, t: 26, b: 22 };
  const w = Math.max(120, width);
  const max = Math.max(1e-9, ...chart.values);
  const xs = chart.values.map((_, i) => m.l + (i * (w - m.l - m.r)) / Math.max(1, chart.values.length - 1));
  const pts: Pt[] = chart.values.map((v, i) => [xs[i], m.t + (1 - v / max) * (h - m.t - m.b)]);
  const shown = hover ?? chart.hi ?? null;
  const color = colorOf(chart.model);
  return (
    <div ref={wrap} className="vb-mini vb-mini-line">
      <p className="vb-mini-label">{chart.label}</p>
      {width > 0 && (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${chart.label}：${chart.labels.map((l, i) => `${l} ${chart.display[i]}`).join('，')}`}
          onPointerMove={e => { const r = e.currentTarget.getBoundingClientRect(); setHover(nearestIndex(xs, ((e.clientX - r.left) / r.width) * w)); }}
          onPointerLeave={() => setHover(null)}>
          <path d={smoothPath(pts)} className="vb-line" pathLength={1} style={{ stroke: color }} />
          {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={shown === i ? 4.5 : 2.5} style={{ fill: shown === i ? color : 'var(--vb-surface)', stroke: color }} strokeWidth={1.5} />)}
          {chart.labels.map((l, i) => <text key={l} x={xs[i]} y={h - 4} textAnchor={i === 0 ? 'start' : i === chart.labels.length - 1 ? 'end' : 'middle'} className="vb-mini-axis">{l}</text>)}
          {shown !== null && <text x={Math.max(20, Math.min(w - 20, pts[shown][0]))} y={pts[shown][1] - 10} textAnchor="middle" className="vb-mini-val">{chart.display[shown]}</text>}
        </svg>
      )}
    </div>
  );
}

/** 指标卡上的迷你折线：末端脉冲点，悬停显示该点数值 */
export function Spark({ values, labels, fmt, color = 'var(--accent)' }: { values: number[]; labels: string[]; fmt: (v: number) => string; color?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 120, h = 36;
  const max = Math.max(1e-9, ...values), min = Math.min(...values);
  const xs = values.map((_, i) => 3 + (i * (w - 6)) / Math.max(1, values.length - 1));
  const pts: Pt[] = values.map((v, i) => [xs[i], 4 + (1 - (v - min) / (max - min || 1)) * (h - 8)]);
  const last = pts[pts.length - 1];
  return (
    <span className="vb-spark" onPointerLeave={() => setHover(null)}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={labels.map((l, i) => `${l} ${fmt(values[i])}`).join('，')}
        onPointerMove={e => { const r = e.currentTarget.getBoundingClientRect(); setHover(nearestIndex(xs, ((e.clientX - r.left) / r.width) * w)); }}
        onPointerDown={e => { const r = e.currentTarget.getBoundingClientRect(); setHover(nearestIndex(xs, ((e.clientX - r.left) / r.width) * w)); }}>
        <path d={smoothPath(pts)} fill="none" style={{ stroke: color }} strokeWidth={2} strokeLinecap="round" />
        {last && hover === null && <><circle className="vb-pulse" cx={last[0]} cy={last[1]} r={6} style={{ fill: color }} /><circle cx={last[0]} cy={last[1]} r={2.5} style={{ fill: color }} /></>}
        {hover !== null && <><line x1={xs[hover]} x2={xs[hover]} y1={0} y2={h} className="vb-spark-cross" /><circle cx={pts[hover][0]} cy={pts[hover][1]} r={3} style={{ fill: color }} /></>}
      </svg>
      {hover !== null && <span className="vb-spark-tip" role="status">{labels[hover]} · {fmt(values[hover])}</span>}
    </span>
  );
}
