import { useState } from 'react';
import { arcPath } from '../../../core/charts/scale';
import { pct, pctNumber, wan } from '../../../core/data/format';
import type { ModelStat } from '../../../core/data/derive';
import { useReveal, clamp, Roll, useModelColor } from '../lib';

const A0 = -Math.PI * 0.75;
const A1 = Math.PI * 0.75;

/**
 * 270° 遥测仪表：轨道、刻度始终可见（静止状态）；数值弧用 stroke-dashoffset 描出，
 * 末端指示点用 rotate 跟随。数值变化（切换型号）时弧和数字滚轮一起过渡。
 */
export function Gauge({ value, color, label, caption, size = 200 }: {
  value: number;
  color: string;
  label: string;
  caption?: string;
  size?: number;
}) {
  const [ref, played] = useReveal<SVGSVGElement>(0.35);
  const S = size, c = S / 2, r = S * 0.37;
  const v = played ? clamp(value, 0, 1) : 0;
  const ticks = Array.from({ length: 41 }, (_, i) => A0 + ((A1 - A0) * i) / 40);
  const deg = ((A0 + (A1 - A0) * v) * 180) / Math.PI;
  const H = S * 0.9;
  return (
    <div className="va-gauge" style={{ width: S }}>
      <svg ref={ref} width={S} height={H} viewBox={`0 0 ${S} ${H}`} className="va-svg va-gauge-svg" role="img" aria-label={`${label}${caption ? ` ${caption}` : ''}完成率 ${pctNumber(value)}%`}>
        {ticks.map((a, i) => {
          const major = i % 10 === 0;
          const r0 = r + 12, r1 = r + (major ? 20 : 15);
          const lit = (i / 40) <= v + 1e-6;
          return <line key={i} x1={c + r0 * Math.sin(a)} y1={c - r0 * Math.cos(a)} x2={c + r1 * Math.sin(a)} y2={c - r1 * Math.cos(a)}
            className={`va-gauge-tick${major ? ' is-major' : ''}${lit ? ' is-lit' : ''}`} style={lit ? { stroke: color, transitionDelay: `${(i / 40) * 600}ms` } : undefined} />;
        })}
        {[0, 50, 100].map((t, i) => {
          const a = A0 + ((A1 - A0) * i) / 2;
          const rr = r + 32;
          return <text key={t} x={c + rr * Math.sin(a)} y={c - rr * Math.cos(a)} dy="0.34em" textAnchor="middle" className="va-tick">{t}</text>;
        })}
        <path d={arcPath(c, c, r, A0, A1)} className="va-gauge-track" />
        <path d={arcPath(c, c, r, A0, A1)} className="va-gauge-val" pathLength={1} style={{ stroke: color, strokeDasharray: '1 1', strokeDashoffset: 1 - v }} />
        <g className="va-gauge-needle" style={{ transform: `rotate(${deg}deg)`, transformOrigin: `${c}px ${c}px` }}>
          <circle cx={c} cy={c - r} r={5.5} className="va-gauge-end" style={{ fill: color }} />
          <line x1={c} x2={c} y1={c - r + 14} y2={c - r + 24} className="va-gauge-pin" style={{ stroke: color }} />
        </g>
      </svg>
      <div className="va-gauge-center" style={{ top: c }}>
        <span className="va-gauge-num"><Roll value={Math.round(value * 1000)} format={n => pctNumber(n / 1000)} label={`${pctNumber(value)}%`} /><small>%</small></span>
        <span className="va-mono">{label}</span>
      </div>
    </div>
  );
}

/** 仪表 + 型号列表：悬停 / 聚焦 / 点选型号时仪表切到该型号，离开回到合计 */
export function GaugePanel({ models, total, size = 208 }: { models: ModelStat[]; total: number; size?: number }) {
  const color = useModelColor();
  const [id, setId] = useState<string | null>(null);
  const m = models.find(x => x.id === id) ?? null;
  return (
    <div className="va-gauge-card">
      <Gauge value={m ? m.completion : total} color={m ? color(m.id) : 'var(--va-ink-1)'} label={m ? m.id : models.length === 1 ? models[0].id : '全部型号'} caption={m?.dept} size={size} />
      <ul className="va-gauge-list" onPointerLeave={() => setId(null)}>
        {models.map(x => (
          <li key={x.id}>
            <button type="button" className={id === x.id ? 'is-on' : ''} aria-pressed={id === x.id}
              onPointerEnter={() => setId(x.id)} onFocus={() => setId(x.id)} onClick={() => setId(g => (g === x.id ? null : x.id))}>
              <span className="va-gl-id"><i style={{ background: color(x.id) }} aria-hidden="true" /><span className="va-mono">{x.id}</span></span>
              <span className="va-gl-bar" aria-hidden="true"><span style={{ transform: `scaleX(${clamp(x.completion, 0, 1)})`, background: color(x.id) }} /></span>
              <b className="va-num">{pct(x.completion)}</b>
              <span className="va-gl-sub">{wan(x.revenue)} / {wan(x.target)} 万元</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
