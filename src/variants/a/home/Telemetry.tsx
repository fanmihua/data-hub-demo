import { useId, useRef, useState, type PointerEvent } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { useDerived } from '../../../core/provider';

import { nearestIndex, scaleLinear, smoothPath, type Pt } from '../../../core/charts/scale';
import { monthLabel, pct, pctNumber, wan } from '../../../core/data/format';
import { cumsum, useReveal, useSize, Roll } from '../lib';

/** 迷你折线：末端脉冲点；悬停显示该月数值 */
function Spark({ values, labels, color, format, label }: { values: number[]; labels: string[]; color: string; format: (v: number) => string; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const { width } = useSize(box);
  const [svgRef, played] = useReveal<SVGSVGElement>(0.4);
  const [hover, setHover] = useState<number | null>(null);
  const gid = `spk${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const W = Math.max(60, width), H = 44, pad = 5;
  const lo = Math.min(...values), hi = Math.max(...values);
  const y = scaleLinear([lo - (hi - lo) * 0.08, hi + (hi - lo) * 0.12 || 1], [H - pad, pad]);
  const xs = values.map((_, i) => pad + (values.length <= 1 ? 0 : (i * (W - pad * 2)) / (values.length - 1)));
  const pts: Pt[] = values.map((v, i) => [xs[i], y(v)]);
  const last = pts[pts.length - 1];
  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(nearestIndex(xs, e.clientX - r.left));
  };
  return (
    <div ref={box} className="va-spark">
      {width > 0 && values.length > 0 && (
        <svg ref={svgRef} width={W} height={H} className={`va-svg${played ? ' is-played' : ''}`} role="img" aria-label={label} style={{ color }}>
          <defs>
            <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="currentColor" stopOpacity=".16" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g>
            <path d={`${smoothPath(pts)}L${last[0]},${H}L${pts[0][0]},${H}Z`} fill={`url(#${gid})`} className="va-area" />
            <path d={smoothPath(pts)} className="va-line-ghost" style={{ stroke: color }} />
            <path d={smoothPath(pts)} className="va-line va-draw" pathLength={1} style={{ stroke: color }} />
            {hover === null && (
              <g transform={`translate(${last[0]} ${last[1]})`}>
                <circle r={7} className="va-pulse" style={{ fill: color }} />
                <circle r={3} style={{ fill: color }} />
              </g>
            )}
            {hover !== null && (
              <g>
                <line x1={xs[hover]} x2={xs[hover]} y1={0} y2={H} className="va-spark-cross" />
                <circle cx={xs[hover]} cy={pts[hover][1]} r={3.5} style={{ fill: color }} />
              </g>
            )}
          </g>
          <rect x={0} y={0} width={W} height={H} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
      )}
      {hover !== null && (
        <span className="va-spark-tip" style={{ left: Math.min(Math.max(xs[hover], 40), W - 40) }}>
          {labels[hover]} · <b className="va-num">{format(values[hover])}</b>
        </span>
      )}
    </div>
  );
}

function Delta({ value, unit, note }: { value: number; unit: string; note: string }) {
  const up = value > 0.0005, down = value < -0.0005;
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  return (
    <p className="va-delta">
      <span className={`va-delta-chip${up ? ' is-up' : down ? ' is-down' : ''}`}>
        <Icon size={13} strokeWidth={2.2} aria-hidden="true" />
        <span className="va-num">{up ? '+' : down ? '−' : ''}{Math.abs(value).toFixed(1)}{unit}</span>
      </span>
      <span>{note}</span>
    </p>
  );
}

/**
 * 指标带：5 张遥测卡。累计序列由派生数据算出：
 * 收入按月度收入累计；报账按报账月份累计；付款按付款日期累计；待付 = 累计报账 − 累计付款。
 */
export function Telemetry() {
  const d = useDerived();
  const revCum = cumsum(d.monthlyRevenue.map(m => m.total));
  const target = d.business.target || 1;
  const compl = revCum.map(v => v / target);

  const billMonths = [...new Set([...d.bills.map(b => b.month), ...d.bills.flatMap(b => b.payments.map(p => p.date.slice(0, 7)))])].sort();
  const billedCum = cumsum(billMonths.map(m => d.bills.filter(b => b.month === m).reduce((s, b) => s + b.amount, 0)));
  const paidCum = cumsum(billMonths.map(m => d.bills.reduce((s, b) => s + b.payments.filter(p => p.date.startsWith(m)).reduce((a, p) => a + p.amount, 0), 0)));
  const unpaidCum = billedCum.map((v, i) => v - paidCum[i]);
  const billLabels = billMonths.map(monthLabel);
  const prevLabel = (ls: string[]) => (ls.length > 1 ? `较 ${ls[ls.length - 2]}末` : '本期');
  const growth = (xs: number[]) => (xs.length > 1 && xs[xs.length - 2] ? (xs[xs.length - 1] / xs[xs.length - 2] - 1) * 100 : 0);
  const lastMonthLabels = d.monthLabels;

  const cards = [
    {
      code: 'REV · YTD', title: '年度收入', value: d.business.revenue, fmt: (n: number) => wan(n), unit: '万元',
      spark: revCum, labels: lastMonthLabels, color: 'var(--va-m1)', sfmt: (v: number) => `${wan(v)} 万元`,
      delta: { value: growth(revCum), unit: '%', note: prevLabel(lastMonthLabels) },
      foot: `目标 ${wan(d.business.target)} 万元`,
    },
    {
      code: 'TARGET · CMPL', title: '目标完成率', value: Math.round(d.business.completion * 1000), fmt: (n: number) => pctNumber(n / 1000), unit: '%',
      spark: compl, labels: lastMonthLabels, color: 'var(--va-m1)', sfmt: (v: number) => pct(v),
      delta: { value: compl.length > 1 ? (compl[compl.length - 1] - compl[compl.length - 2]) * 100 : 0, unit: ' 个百分点', note: prevLabel(lastMonthLabels) },
      foot: `缺口 ${wan(d.business.gap)} 万元`,
    },
    {
      code: 'BILLED', title: '报账金额', value: d.spend.billed, fmt: (n: number) => wan(n), unit: '万元',
      spark: billedCum, labels: billLabels, color: 'var(--va-m2)', sfmt: (v: number) => `${wan(v)} 万元`,
      delta: { value: growth(billedCum), unit: '%', note: prevLabel(billLabels) },
      foot: `${d.spend.billCount} 张报账单`,
    },
    {
      code: 'PAID', title: '已付款', value: d.spend.paid, fmt: (n: number) => wan(n), unit: '万元',
      spark: paidCum, labels: billLabels, color: 'var(--va-m3)', sfmt: (v: number) => `${wan(v)} 万元`,
      delta: { value: growth(paidCum), unit: '%', note: prevLabel(billLabels) },
      foot: `付款率 ${pct(d.spend.payRate)} · ${d.spend.paymentCount} 笔`,
    },
    {
      code: 'PENDING', title: '待付款', value: d.spend.unpaid, fmt: (n: number) => wan(n), unit: '万元',
      spark: unpaidCum, labels: billLabels, color: 'var(--va-signal)', sfmt: (v: number) => `${wan(v)} 万元`,
      delta: { value: growth(unpaidCum), unit: '%', note: prevLabel(billLabels) },
      foot: `${d.byStatus.filter(s => s.status !== '已付清').reduce((s, x) => s + x.count, 0)} 张未付清`,
    },
  ];

  return (
    <ul className="va-telemetry" aria-label="关键指标">
      {cards.map((c, i) => (
        <li key={c.code} className="va-tele va-cross">
          <div className="va-tele-top">
            <span className="va-mono">{String(i + 1).padStart(2, '0')} · {c.code}</span>
          </div>
          <h3 className="va-tele-title">{c.title}</h3>
          <p className="va-tele-value">
            <Roll value={c.value} format={c.fmt} className="va-tele-num" />
            <span className="va-tele-unit">{c.unit}</span>
          </p>
          <Spark values={c.spark} labels={c.labels} color={c.color} format={c.sfmt} label={`${c.title}按月累计走势`} />
          <Delta {...c.delta} />
          <p className="va-tele-foot">{c.foot}</p>
        </li>
      ))}
    </ul>
  );
}

