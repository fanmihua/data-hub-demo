import { createContext, useContext } from 'react';
import type { BillRow, Derived } from '../../../../core/data/derive';
import { dayLabel, monthShort, pct, pctNumber, wan } from '../../../../core/data/format';
import { METRICS, lastMonths, metricSeries, metricValue } from '../../model/metrics';
import type { ChartType, MetricKey, WidgetColor, WidgetKind } from '../../model/types';

/**
 * 看板驾驶舱内部共用的口径与文案（只在 screens/board 里用）。
 * 数字一律从 Derived 现算，不写死。
 */

/** 看板筛选：型号（单选，空数组为全部）、期间（'all' | 'q3' | 'q4' | 'YYYY-MM'） */
export interface BoardFilter { models: string[]; period: string }

export const COLOR_VAR: Record<WidgetColor, string> = {
  accent: 'var(--accent)',
  m1: 'var(--vd-m1)',
  m2: 'var(--vd-m2)',
  m3: 'var(--vd-m3)',
  signal: 'var(--vd-signal)',
};
export const COLOR_LABEL: Record<WidgetColor, string> = { accent: '主色', m1: '型号色 1', m2: '型号色 2', m3: '型号色 3', signal: '尾焰橙' };

export const KIND_LABEL: Record<WidgetKind, string> = {
  kpi: '指标卡', stream: '数据流', globe: '地球轨道', timeseries: '月度图表', bars: '条形图',
  sankey: '桑基图', contracts: '合同履约', timeline: '报账时间线', ring: '环形图',
};
/** 面板角标（等宽遥测小字） */
export const KIND_CODE: Record<WidgetKind, string> = {
  kpi: 'KPI', stream: 'STREAM', globe: 'ORBIT', timeseries: 'SERIES', bars: 'BARS',
  sankey: 'FLOW', contracts: 'CONTRACTS', timeline: 'TIMELINE', ring: 'RING',
};
export const TYPE_LABEL: Record<ChartType, string> = { line: '折线', area: '面积', bar: '柱状', table: '表格', treemap: '树图', stream: '流图', heatmap: '热力', sunburst: '旭日', bubble: '气泡', radial: '径向' };
/** 构成分析的六种图形（只有按报账单拆的 bars 组件能用） */
export const BREAK_TYPES: ChartType[] = ['treemap', 'stream', 'heatmap', 'sunburst', 'bubble', 'radial'];

/** 这些组件读 metric；其余组件的数据由类型决定 */
export const USES_METRIC: Record<WidgetKind, boolean> = {
  kpi: true, stream: true, timeseries: true, bars: true, ring: true,
  globe: false, sankey: false, contracts: false, timeline: false,
};
/** 这些组件的颜色由型号决定，配置里不给颜色项 */
export const USES_COLOR: Record<WidgetKind, boolean> = {
  kpi: true, stream: true, timeseries: true, bars: true, contracts: true,
  globe: false, sankey: false, timeline: false, ring: false,
};
/** 没有月度口径的指标（数据里只有年度回款） */
export const NO_MONTHLY: MetricKey[] = ['received', 'receivedRate'];
/** 按型号分组的指标；其余按分系统 */
export const BY_MODEL: MetricKey[] = ['revenue', 'received', 'completion', 'receivedRate'];

/** 维度说明（配置面板只读展示） */
export function dimensionOf(kind: WidgetKind, metric?: MetricKey): string {
  switch (kind) {
    case 'kpi': return '全年合计';
    case 'stream': return '近 6 个月 · 按月';
    case 'timeseries': return metric === 'revenue' ? '按月 · 按型号分系列' : '按月';
    case 'bars': return metric && BY_MODEL.includes(metric) ? '按型号' : '按分系统';
    case 'ring': return '按型号';
    case 'sankey': return '型号 → 分系统 → 付款状态';
    case 'contracts': return '按合同';
    case 'timeline': return '按报账日期 · 按型号分行';
    case 'globe': return '按型号';
  }
}

/** 大数：数字部分与单位分开（单位缩小、基线对齐） */
export function numFmt(key: MetricKey) {
  return METRICS[key].unit === 'pct'
    ? { format: (v: number) => pctNumber(v), unit: '%', text: (v: number) => pct(v) }
    : { format: (v: number) => wan(v), unit: '万元', text: (v: number) => `${wan(v)} 万元` };
}

/** 指标卡的旁注与进度（0–1，没有就不画） */
export function kpiContext(d: Derived, key: MetricKey): { text: string; ratio: number | null } {
  const b = d.business, s = d.spend;
  switch (key) {
    case 'completion': return { text: `目标 ${wan(b.target)} 万`, ratio: b.completion };
    case 'revenue': return { text: `目标 ${wan(b.target)} 万`, ratio: b.completion };
    case 'received': return { text: `占收入 ${pct(b.receivedRate)}`, ratio: b.receivedRate };
    case 'receivedRate': return { text: `已回 ${wan(b.received)} 万`, ratio: b.receivedRate };
    case 'billed': return { text: `${s.billCount} 张报账单`, ratio: null };
    case 'paid': return { text: `${s.paymentCount} 笔付款`, ratio: s.payRate };
    case 'unpaid': return { text: `${d.bills.filter(x => x.unpaid > 0).length} 张未付清`, ratio: s.billed ? s.unpaid / s.billed : 0 };
    case 'payRate': return { text: `已付 ${wan(s.paid)} / ${wan(s.billed)} 万`, ratio: s.payRate };
  }
}

/**
 * 数据流小卡：当前值（全年累计）+ 近 6 个月按月取值 + 「较上月」变化。
 * 变化指的是大数本身较上月末的变化：金额是本月新增（待付款是本月报账 − 本月付款），比例是百分点差。
 */
export function streamFacts(d: Derived, key: MetricKey) {
  const months = lastMonths(d, 6);
  const series = metricSeries(d, key, months);
  const value = metricValue(d, key);
  if (!series) return { value, months, series: null, delta: null };
  const n = series.length;
  const last = series[n - 1] ?? 0, prev = series[n - 2] ?? 0;
  const when = monthShort(months[n - 1]);
  let delta: { text: string; dir: 'up' | 'down' | 'flat'; when: string };
  if (METRICS[key].unit === 'pct') {
    const pt = (last - prev) * 100;
    delta = { text: `${pt >= 0 ? '+' : '−'}${Math.abs(pt).toFixed(1)} pt`, dir: Math.abs(pt) < 0.05 ? 'flat' : pt > 0 ? 'up' : 'down', when };
  } else {
    let add = last;
    if (key === 'unpaid') {
      const billed = metricSeries(d, 'billed', months) ?? [];
      const paid = metricSeries(d, 'paid', months) ?? [];
      add = (billed[n - 1] ?? 0) - (paid[n - 1] ?? 0);
    }
    const flat = Math.abs(add) < 50;
    delta = { text: flat ? '持平' : `${add > 0 ? '+' : '−'}${wan(Math.abs(add))} 万`, dir: flat ? 'flat' : add > 0 ? 'up' : 'down', when };
  }
  return { value, months, series, delta };
}

/** 报账类指标的月份：从第一张报账单所在月到最近一个月（缺的月份补 0） */
export function spendMonths(d: Derived): string[] {
  const end = lastMonths(d, 1)[0];
  const first = d.bills.length ? d.bills.reduce((m, b) => (b.month < m ? b.month : m), d.bills[0].month) : end;
  const out: string[] = [];
  let y = Number(first.slice(0, 4)), m = Number(first.slice(5, 7));
  for (let k = 0; k < 24; k++) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    if (key > end) break;
    out.push(key);
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return out.length ? out : [end];
}

/** 当前月份是否还没过完（例如截至 11 月 4 日） */
export function partialMonth(d: Derived, month: string) {
  return d.meta.asOf.slice(0, 7) === month ? `截至${dayLabel(d.meta.asOf.slice(0, 10))}` : null;
}

export const STATUS_KIND: Record<BillRow['status'], 'paid' | 'part' | 'none'> = { 已付清: 'paid', 部分付款: 'part', 未付款: 'none' };

/** 看板上下文：付款链路浮层、编辑状态 */
export interface BoardCtxValue {
  openBill: (bill: BillRow, anchor: DOMRect, trigger?: HTMLElement | SVGElement | null) => void;
  activeBill: string | null;
  editing: boolean;
}
export const BoardCtx = createContext<BoardCtxValue>({ openBill: () => {}, activeBill: null, editing: false });
export const useBoard = () => useContext(BoardCtx);
