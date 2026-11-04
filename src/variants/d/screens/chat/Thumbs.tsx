import { useId, useMemo, useRef, type ReactNode } from 'react';
import { useDerived } from '../../../../core/provider';
import { int, monthShort, pct, pctNumber, wan } from '../../../../core/data/format';
import { areaPath, barPath, niceMax, ringPath, smoothPath, type Pt } from '../../../../core/charts/scale';
import { layoutSankey } from '../../../../core/charts/sankey';
import { lastMonths, METRICS, metricSeries, metricValue } from '../../model/metrics';
import type { MetricKey, WidgetConfig } from '../../model/types';
import { BigNumber } from '../../ui/BigNumber';
import { Sparkline } from '../../ui/Sparkline';
import { IconGlobe } from '../../ui/icons';
import { useModelColor } from '../../ui/lib';
import { useBox } from '../../viz/util';

/**
 * 草稿网格里的缩略组件：就是看板上对应组件的缩略版，数字全部来自 useDerived。
 * 只做静态小图（不带坐标轴交互），尺寸跟随格子。
 */

const colorVar = (c: WidgetConfig['color']) =>
  c === 'm1' ? 'var(--vd-m1)' : c === 'm2' ? 'var(--vd-m2)' : c === 'm3' ? 'var(--vd-m3)' : c === 'signal' ? 'var(--vd-signal)' : 'var(--accent)';

export function Thumb({ w }: { w: WidgetConfig }) {
  return (
    <div className={`vd-ct-th is-${w.kind}`}>
      <p className="vd-ct-th-h"><span>{w.title}</span></p>
      <div className="vd-ct-th-body"><ThumbBody w={w} /></div>
    </div>
  );
}

function ThumbBody({ w }: { w: WidgetConfig }) {
  const d = useDerived();
  const metric: MetricKey = w.metric ?? 'revenue';
  switch (w.kind) {
    case 'kpi': {
      const m = METRICS[metric];
      const v = metricValue(d, metric);
      return (
        <div className="vd-ct-th-kpi">
          <BigNumber value={v} format={x => (m.unit === 'pct' ? pctNumber(x) : wan(x))} unit={m.unit === 'pct' ? '%' : '万元'} size="md" />
          <span className="vd-ct-th-sub">{m.desc}</span>
        </div>
      );
    }
    case 'stream': {
      const m = METRICS[metric];
      const v = metricValue(d, metric);
      const s = metricSeries(d, metric);
      return (
        <div className="vd-ct-th-stream">
          <b className="vd-ct-th-num">{m.unit === 'pct' ? pctNumber(v) : wan(v)}<small>{m.unit === 'pct' ? '%' : '万元'}</small></b>
          {s ? <Sparkline values={s} color={colorVar(w.color)} width={96} height={28} /> : <span className="vd-ct-th-sub">没有月度明细</span>}
        </div>
      );
    }
    case 'timeseries': return <MiniSeries metric={metric} type={w.chartType === 'bar' ? 'bar' : 'area'} color={colorVar(w.color)} />;
    case 'sankey': return <MiniSankey />;
    case 'contracts': return <MiniContracts />;
    case 'ring': return <MiniRing metric={metric} />;
    case 'timeline': return <MiniTimeline />;
    case 'bars': return <MiniBars metric={metric} />;
    default: return <span className="vd-ct-th-icon"><IconGlobe size={20} /></span>;
  }
}

function useSize() {
  const ref = useRef<HTMLDivElement>(null);
  const size = useBox(ref);
  return [ref, size.width, size.height] as const;
}

/** 近 6 个月：柱或面积；收入按型号堆叠 */
function MiniSeries({ metric, type, color }: { metric: MetricKey; type: 'bar' | 'area'; color: string }) {
  const d = useDerived();
  const colorOf = useModelColor();
  const gid = `vd-ct-g${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [ref, w, h] = useSize();
  const months = lastMonths(d);
  const total = metricSeries(d, metric);
  const byModel = metric === 'revenue' && d.models.length > 1 && type === 'area'
    ? d.models.map(m => ({ id: m.id, values: months.map(mm => d.monthlyRevenue.find(x => x.month === mm)?.byModel[m.id] ?? 0) }))
    : null;
  const lab = 14;
  const ih = Math.max(10, h - lab);
  const max = niceMax(Math.max(1e-9, ...(total ?? [0])), 3);
  const n = months.length;
  const x = (i: number) => (n <= 1 ? w / 2 : 6 + (i * (w - 12)) / (n - 1));
  const y = (v: number) => 4 + (1 - v / max) * (ih - 6);
  let body: ReactNode = null;
  if (!total) body = <text x={w / 2} y={ih / 2} className="vd-ct-th-empty" textAnchor="middle">没有月度明细</text>;
  else if (type === 'bar') {
    const step = w / n;
    const bw = Math.min(14, step * 0.5);
    body = total.map((v, i) => <path key={i} d={barPath(i * step + (step - bw) / 2, y(v), bw, Math.max(0, ih - 2 - y(v)), 3)} style={{ fill: color }} opacity={i === n - 1 ? 1 : 0.55} />);
  } else if (byModel) {
    const acc = months.map(() => 0);
    body = byModel.map(s => {
      const lower: Pt[] = s.values.map((_, i) => [x(i), y(acc[i])]);
      s.values.forEach((v, i) => { acc[i] += v; });
      const upper: Pt[] = s.values.map((_, i) => [x(i), y(acc[i])]);
      const dd = `${smoothPath(upper)}L${lower.slice().reverse().map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L')}Z`;
      return <g key={s.id}><path d={dd} style={{ fill: colorOf(s.id) }} opacity={0.22} /><path d={smoothPath(upper)} style={{ stroke: colorOf(s.id) }} className="vd-ct-th-line" /></g>;
    });
  } else {
    const pts: Pt[] = total.map((v, i) => [x(i), y(v)]);
    body = (
      <>
        <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{ stopColor: color, stopOpacity: 0.24 }} /><stop offset="1" style={{ stopColor: color, stopOpacity: 0 }} /></linearGradient></defs>
        <path d={areaPath(pts, ih - 2)} fill={`url(#${gid})`} />
        <path d={smoothPath(pts)} style={{ stroke: color }} className="vd-ct-th-line" />
      </>
    );
  }
  return (
    <div ref={ref} className="vd-ct-th-fig">
      {w > 0 && h > 0 && (
        <svg width={w} height={h} aria-hidden="true">
          <line x1={0} x2={w} y1={ih - 1.5} y2={ih - 1.5} className="vd-ct-th-base" />
          {body}
          {months.map((m, i) => (i % 2 === 1 || n <= 4) && (
            <text key={m} x={type === 'bar' ? (i + 0.5) * (w / n) : x(i)} y={h - 2} className="vd-ct-th-tick" textAnchor="middle">{monthShort(m)}</text>
          ))}
        </svg>
      )}
    </div>
  );
}

/** 资金流向：型号 → 分系统 → 付款状态，不带文字，只看形状与颜色 */
function MiniSankey() {
  const d = useDerived();
  const colorOf = useModelColor();
  const [ref, w, h] = useSize();
  const lay = useMemo(() => (w > 20 && h > 20 && d.flow.nodes.length ? layoutSankey(d.flow.nodes, d.flow.links, { width: w, height: h - 14, nodeWidth: 5, gap: 4 }) : null), [d, w, h]);
  const nodeColor = (id: string) => (id.startsWith('m:') ? colorOf(id.slice(2)) : id === 'st:unpaid' ? 'var(--vd-signal)' : id === 'st:paid' ? 'var(--accent)' : 'var(--vd-ink-3)');
  return (
    <div ref={ref} className="vd-ct-th-fig">
      {lay && (
        <svg width={w} height={h} aria-hidden="true">
          <g transform="translate(0,2)">
            {lay.links.map((l, i) => (
              <path key={i} d={l.path} className="vd-ct-th-flow" style={{ stroke: l.source.startsWith('m:') ? nodeColor(l.source) : 'var(--vd-ink-3)', strokeWidth: Math.max(1, l.width) }} opacity={l.source.startsWith('m:') ? 0.28 : 0.13} />
            ))}
            {lay.nodes.map(n => <rect key={n.id} x={n.x} y={n.y} width={n.w} height={Math.max(1, n.h)} rx={1.5} style={{ fill: nodeColor(n.id) }} />)}
          </g>
          <text x={0} y={h - 1} className="vd-ct-th-tick">型号</text>
          <text x={w / 2} y={h - 1} className="vd-ct-th-tick" textAnchor="middle">分系统</text>
          <text x={w} y={h - 1} className="vd-ct-th-tick" textAnchor="end">付款</text>
        </svg>
      )}
    </div>
  );
}

/** 合同履约：每份合同一根条，主色为已付款，浅底为合同额 */
function MiniContracts() {
  const d = useDerived();
  const rows = d.contracts.slice(0, 4);
  if (!rows.length) return <span className="vd-ct-th-sub">没有合同</span>;
  return (
    <ul className="vd-ct-th-bars">
      {rows.map(c => (
        <li key={c.id}>
          <span>{c.name.replace(/合同$/, '')}</span>
          <i><b style={{ transform: `scaleX(${Math.max(0, Math.min(1, c.payRate))})` }} /></i>
          <em>{pct(c.payRate)}</em>
        </li>
      ))}
    </ul>
  );
}

/** 按型号或分系统分组的条 */
function MiniBars({ metric }: { metric: MetricKey }) {
  const d = useDerived();
  const colorOf = useModelColor();
  const byModel = ['revenue', 'received', 'completion', 'receivedRate'].includes(metric);
  const rows = byModel
    ? d.models.map(m => ({ key: m.id, label: m.id, v: metric === 'revenue' ? m.revenue : metric === 'received' ? m.received : metric === 'completion' ? m.completion : m.receivedRate, color: colorOf(m.id) }))
    : d.bySystem.slice(0, 4).map(g => ({ key: g.key, label: g.key.replace('分系统', ''), v: metric === 'paid' ? g.paid : g.billed, color: 'var(--accent)' }));
  const max = Math.max(1e-9, ...rows.map(r => r.v));
  const pctUnit = METRICS[metric].unit === 'pct';
  return (
    <ul className="vd-ct-th-bars">
      {rows.map(r => (
        <li key={r.key}>
          <span>{r.label}</span>
          <i><b style={{ transform: `scaleX(${r.v / max})`, background: r.color }} /></i>
          <em>{pctUnit ? pct(r.v) : wan(r.v)}</em>
        </li>
      ))}
    </ul>
  );
}

/** 型号构成：metric 按型号的占比（环） */
function MiniRing({ metric }: { metric: MetricKey }) {
  const d = useDerived();
  const colorOf = useModelColor();
  const parts = d.models.map(m => ({ id: m.id, v: metric === 'billed' ? m.billed : metric === 'paid' ? m.paid : m.revenue }));
  const total = parts.reduce((s, p) => s + p.v, 0);
  let a0 = 0;
  const size = 64, c = size / 2;
  return (
    <div className="vd-ct-th-ring">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={c} cy={c} r={c - 6} className="vd-ct-th-track" />
        {total > 0 && parts.map(p => {
          const a1 = a0 + (p.v / total) * Math.PI * 2;
          const path = ringPath(c, c, c - 10, c - 2, a0 + 0.03, Math.max(a0 + 0.03, a1 - 0.03));
          a0 = a1;
          return <path key={p.id} d={path} style={{ fill: colorOf(p.id) }} />;
        })}
      </svg>
      <ul>
        {parts.map(p => <li key={p.id}><i style={{ background: colorOf(p.id) }} />{p.id}<em>{total ? pct(p.v / total) : '—'}</em></li>)}
      </ul>
    </div>
  );
}

/** 报账时间线：每张报账单一个点，横轴为日期，一行一个型号，点大小按金额 */
function MiniTimeline() {
  const d = useDerived();
  const colorOf = useModelColor();
  const [ref, w, h] = useSize();
  const bills = d.bills;
  const lanes = d.models.map(m => m.id);
  const t = (s: string) => new Date(`${s}T00:00:00`).getTime();
  const t0 = Math.min(...bills.map(b => t(b.date))), t1 = Math.max(...bills.map(b => t(b.date)));
  const maxAmt = Math.max(1, ...bills.map(b => b.amount));
  const laneH = (h - 14) / Math.max(1, lanes.length);
  return (
    <div ref={ref} className="vd-ct-th-fig">
      {w > 0 && h > 0 && bills.length > 0 && (
        <svg width={w} height={h} aria-hidden="true">
          {lanes.map((id, i) => <line key={id} x1={0} x2={w} y1={laneH * (i + 0.5)} y2={laneH * (i + 0.5)} className="vd-ct-th-base" />)}
          {bills.map(b => {
            const li = Math.max(0, lanes.indexOf(b.model));
            const x = 6 + (t1 > t0 ? (t(b.date) - t0) / (t1 - t0) : 0.5) * (w - 12);
            return <circle key={b.id} cx={x} cy={laneH * (li + 0.5)} r={2 + 3.2 * Math.sqrt(b.amount / maxAmt)} style={{ fill: colorOf(b.model) }} opacity={b.status === '已付清' ? 0.9 : 0.45} />;
          })}
          <text x={0} y={h - 1} className="vd-ct-th-tick">{monthShort(bills[bills.length - 1].month)}</text>
          <text x={w} y={h - 1} className="vd-ct-th-tick" textAnchor="end">{monthShort(bills[0].month)} · {int(bills.length)} 张</text>
        </svg>
      )}
    </div>
  );
}
