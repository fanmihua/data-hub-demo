import type { Derived } from '../../../core/data/derive.ts';
import { pct, wan } from '../../../core/data/format.ts';
import type { BoardId, MetricKey } from './types.ts';

/**
 * 指标口径：名称、单位、所属看板主题，以及「当前值」和「按月取值」的算法。
 * 资产目录、问答和看板组件共用，保证同一个指标在各处数字一致。
 *
 * 按月取值（metricSeries）：
 * - revenue      月度确认收入合计
 * - billed       当月报账金额（按报账日期）
 * - paid         当月付款金额（按付款日期）
 * - unpaid       当月报账单的待付金额
 * - completion   累计确认收入 ÷ 年度目标（到当月为止）
 * - payRate      累计付款 ÷ 累计报账（到当月为止）
 * - received / receivedRate  数据里只有年度回款，没有月度明细，返回 null，不编造
 */
export interface MetricMeta {
  key: MetricKey;
  label: string;
  /** 口径说明，一句话 */
  desc: string;
  unit: 'wan' | 'pct';
  /** 指标归属的看板主题，用来确定业务域与负责部门 */
  board: BoardId;
}

export const METRICS: Record<MetricKey, MetricMeta> = {
  completion: { key: 'completion', label: '年度目标完成率', desc: '已确认收入 ÷ 年度目标', unit: 'pct', board: 'operations' },
  revenue: { key: 'revenue', label: '确认收入', desc: '各型号年内已确认收入合计', unit: 'wan', board: 'operations' },
  received: { key: 'received', label: '已回款', desc: '各型号年内已回款合计', unit: 'wan', board: 'operations' },
  receivedRate: { key: 'receivedRate', label: '回款率', desc: '已回款 ÷ 已确认收入', unit: 'pct', board: 'operations' },
  billed: { key: 'billed', label: '报账金额', desc: '全部报账单金额合计', unit: 'wan', board: 'expenses' },
  paid: { key: 'paid', label: '已付款', desc: '报账单已付款金额合计', unit: 'wan', board: 'contracts' },
  unpaid: { key: 'unpaid', label: '待付款', desc: '报账金额 − 已付款', unit: 'wan', board: 'contracts' },
  payRate: { key: 'payRate', label: '付款率', desc: '已付款 ÷ 报账金额', unit: 'pct', board: 'contracts' },
};

export const METRIC_KEYS = Object.keys(METRICS) as MetricKey[];

/** 指标当前值：金额为元，比例为 0–1 */
export function metricValue(d: Derived, key: MetricKey): number {
  switch (key) {
    case 'revenue': return d.business.revenue;
    case 'received': return d.business.received;
    case 'completion': return d.business.completion;
    case 'receivedRate': return d.business.receivedRate;
    case 'billed': return d.spend.billed;
    case 'paid': return d.spend.paid;
    case 'unpaid': return d.spend.unpaid;
    case 'payRate': return d.spend.payRate;
  }
}

/** 指标的展示文本：金额「3,860 万元」，比例「77.2%」 */
export function metricText(key: MetricKey, value: number): string {
  return METRICS[key].unit === 'pct' ? pct(value) : `${wan(value)} 万元`;
}

const addMonths = (month: string, n: number) => {
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12 + 1;
  return `${yy}-${String(mm).padStart(2, '0')}`;
};

/**
 * 近 n 个月（YYYY-MM，从早到晚）。以 d.months 的最后一个月为终点，
 * 没有月度数据时以 meta.asOf 所在月为终点；不足 n 个月时向前补齐。
 */
export function lastMonths(d: Derived, n = 6): string[] {
  const end = d.months[d.months.length - 1] ?? d.meta.asOf.slice(0, 7);
  return Array.from({ length: n }, (_, i) => addMonths(end, i - n + 1));
}

const endOf = (month: string) => `${month}-31`;

/** 指标按月取值，月份由调用方给出（缺失的月份为 0）；没有月度口径的指标返回 null */
export function metricSeries(d: Derived, key: MetricKey, months: string[] = lastMonths(d)): number[] | null {
  const payments = d.bills.flatMap(b => b.payments);
  switch (key) {
    case 'revenue':
      return months.map(m => d.monthlyRevenue.find(x => x.month === m)?.total ?? 0);
    case 'billed':
      return months.map(m => d.bills.filter(b => b.month === m).reduce((s, b) => s + b.amount, 0));
    case 'paid':
      return months.map(m => payments.filter(p => p.date.startsWith(m)).reduce((s, p) => s + p.amount, 0));
    case 'unpaid':
      return months.map(m => d.bills.filter(b => b.month === m).reduce((s, b) => s + b.unpaid, 0));
    case 'completion': {
      const target = d.business.target;
      return months.map(m => {
        const cum = d.monthlyRevenue.filter(x => x.month <= m).reduce((s, x) => s + x.total, 0);
        return target ? cum / target : 0;
      });
    }
    case 'payRate':
      return months.map(m => {
        const billed = d.bills.filter(b => b.date <= endOf(m)).reduce((s, b) => s + b.amount, 0);
        const paid = payments.filter(p => p.date <= endOf(m)).reduce((s, p) => s + p.amount, 0);
        return billed ? paid / billed : 0;
      });
    case 'received':
    case 'receivedRate':
      return null;
  }
}
