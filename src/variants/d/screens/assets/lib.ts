import type { Derived } from '../../../../core/data/derive';
import type { DataHubData } from '../../../../core/data/types';
import { int, pctNumber, wan } from '../../../../core/data/format';
import { METRICS, metricSeries, metricValue } from '../../model/metrics';
import type { BoardId, CatalogItem, CatalogKind, MetricKey } from '../../model/types';

/**
 * 资产列表界面用到的派生口径（只在本界面使用）：
 * - 分组：看板 / 数据表 / 指标 / 筹备中（筹备中业务域在 catalog 里记为 metric，这里按 status 单独成组）；
 * - 编码、主数字、关联看板、血缘链路，全部从 CatalogItem、data、Derived 推出，不编造。
 */

export type Group = CatalogKind | 'planned';
export const groupOf = (i: CatalogItem): Group => (i.status === 'planned' ? 'planned' : i.kind);

export const GROUPS: { id: Group; label: string; en: string }[] = [
  { id: 'board', label: '看板', en: 'BOARDS' },
  { id: 'table', label: '数据表', en: 'TABLES' },
  { id: 'metric', label: '指标', en: 'METRICS' },
  { id: 'planned', label: '筹备中', en: 'PLANNED' },
];
export const GROUP_LABEL: Record<Group, string> = { board: '看板', table: '数据表', metric: '指标', planned: '筹备中' };

/** 数据表的计量单位 */
const TABLE_UNIT: Record<string, string> = { 'table:contracts': '份', 'table:bills': '张', 'table:payments': '笔', 'table:models': '个' };
export const recordUnit = (id: string) => TABLE_UNIT[id] ?? '条';

/** 看板的主指标（与 catalog 的 valueLabel 同一口径） */
const BOARD_METRIC: Record<BoardId, MetricKey> = { operations: 'completion', contracts: 'payRate', expenses: 'billed' };

export const metricKeyOf = (item: CatalogItem): MetricKey | null => {
  if (item.id.startsWith('metric:')) {
    const k = item.id.slice(7);
    return k in METRICS ? (k as MetricKey) : null;
  }
  return item.boardId ? BOARD_METRIC[item.boardId] : null;
};

/** 资产编码：看板用数据里的 code，其余由 id 生成（TABLE.BILLS、METRIC.PAYRATE） */
export function assetCode(item: CatalogItem, data: DataHubData) {
  if (item.kind === 'board' && item.status === 'ready') {
    const a = data.assets.find(x => `board:${x.id}` === item.id);
    if (a?.code) return a.code;
  }
  return item.id.replace(':', '.').toUpperCase();
}

export interface Headline {
  label: string;
  value: number;
  /** 只负责数字部分，给 NumberRoller 用 */
  format: (n: number) => string;
  unit: string;
  /** 完整短文本，例如「77.2%」「804 万元」「12 张」 */
  text: string;
}

/** 预览大数字：指标与看板取当前值，数据表取记录数 */
export function headline(item: CatalogItem, d: Derived): Headline | null {
  if (item.status !== 'ready') return null;
  if (item.kind === 'table') {
    const unit = recordUnit(item.id);
    const v = item.records ?? 0;
    return { label: '记录数', value: v, format: int, unit, text: `${int(v)} ${unit}` };
  }
  const key = metricKeyOf(item);
  if (!key) return null;
  const meta = METRICS[key];
  const v = metricValue(d, key);
  const label = item.kind === 'board' ? meta.label : '当前值';
  return meta.unit === 'pct'
    ? { label, value: v, format: n => pctNumber(n), unit: '%', text: `${pctNumber(v)}%` }
    : { label, value: v, format: n => wan(n), unit: '万元', text: `${wan(v)} 万元` };
}

/** 表格「近 6 个月趋势」旁边的短数值：数据表显示合计金额，其余显示当前值 */
export function shortValue(item: CatalogItem, d: Derived) {
  if (item.status !== 'ready') return '';
  if (item.kind === 'table') return item.valueLabel ?? '';
  return headline(item, d)?.text ?? item.valueLabel ?? '';
}

/** 关联看板：看板就是自己；指标按口径归属；数据表按主题 */
const TABLE_BOARD: Record<string, BoardId> = { 'table:contracts': 'contracts', 'table:bills': 'expenses', 'table:payments': 'contracts', 'table:models': 'operations' };
export function relatedBoard(item: CatalogItem): BoardId | null {
  if (item.status !== 'ready') return null;
  if (item.boardId) return item.boardId;
  if (item.kind === 'table') return TABLE_BOARD[item.id] ?? null;
  const key = metricKeyOf(item);
  return key ? METRICS[key].board : null;
}

/** 趋势是否为比例（指标里的完成率、付款率按月末累计值） */
export function trendIsPct(item: CatalogItem, d: Derived) {
  if (!item.id.startsWith('metric:')) return false;
  const key = metricKeyOf(item);
  return !!key && METRICS[key].unit === 'pct' && metricSeries(d, key) !== null;
}

/** 搜索：名称、说明、负责部门（英文不分大小写） */
export const norm = (s: string) => s.trim().toLowerCase();
export const matches = (item: CatalogItem, q: string) => !q || `${item.name}\n${item.desc}\n${item.owner}`.toLowerCase().includes(q);

/** 把文字按命中的关键词切段，命中段标 hit */
export function splitHits(text: string, q: string): { s: string; hit: boolean }[] {
  if (!q) return [{ s: text, hit: false }];
  const out: { s: string; hit: boolean }[] = [];
  const lower = text.toLowerCase();
  let i = 0;
  while (i < text.length) {
    const k = lower.indexOf(q, i);
    if (k < 0) { out.push({ s: text.slice(i), hit: false }); break; }
    if (k > i) out.push({ s: text.slice(i, k), hit: false });
    out.push({ s: text.slice(k, k + q.length), hit: true });
    i = k + q.length;
  }
  return out;
}

/* ───────── 血缘 ───────── */

export type LineageIcon = 'contract' | 'bill' | 'payment' | 'model' | 'metric' | 'board';
export interface LineageNode {
  id: string;
  label: string;
  meta: string;
  amount: string;
  icon: LineageIcon;
  /** 本资产 */
  self: boolean;
  /** 本资产依赖的节点（其余变淡） */
  on: boolean;
}

/**
 * 小血缘图：财务主题是「合同 → 报账单 → 付款记录」，经营主题是「型号经营 → 确认收入 → 已回款」。
 * 资产本身在链上时直接标出；不在链上（看板、比例类指标）时接在链尾，并只高亮它依赖的节点。
 */
export function lineageOf(item: CatalogItem, data: DataHubData, d: Derived): LineageNode[] {
  const board = relatedBoard(item);
  if (!board) return [];
  const payments = data.bills.reduce((s, b) => s + b.payments.length, 0);
  const contractSum = data.contracts.reduce((s, c) => s + c.amount, 0);
  const finance = board === 'contracts' || board === 'expenses';
  const chain: Omit<LineageNode, 'self' | 'on'>[] = finance
    ? [
      { id: 'table:contracts', label: '合同', meta: `${int(data.contracts.length)} 份`, amount: `${wan(contractSum)} 万元`, icon: 'contract' },
      { id: 'table:bills', label: '报账单', meta: `${int(data.bills.length)} 张`, amount: `${wan(d.spend.billed)} 万元`, icon: 'bill' },
      { id: 'table:payments', label: '付款记录', meta: `${int(payments)} 笔`, amount: `${wan(d.spend.paid)} 万元`, icon: 'payment' },
    ]
    : [
      { id: 'table:models', label: '型号经营', meta: `${int(data.models.length)} 个型号`, amount: `目标 ${wan(d.business.target)} 万元`, icon: 'model' },
      { id: 'metric:revenue', label: '确认收入', meta: '各型号合计', amount: `${wan(d.business.revenue)} 万元`, icon: 'metric' },
      { id: 'metric:received', label: '已回款', meta: '各型号合计', amount: `${wan(d.business.received)} 万元`, icon: 'payment' },
    ];

  if (chain.some(n => n.id === item.id)) return chain.map(n => ({ ...n, self: n.id === item.id, on: true }));

  const DEPS: Record<string, string[]> = {
    'board:contracts': ['table:contracts', 'table:bills', 'table:payments'],
    'board:expenses': ['table:bills', 'table:payments'],
    'metric:billed': ['table:bills'],
    'metric:paid': ['table:payments'],
    'metric:unpaid': ['table:bills', 'table:payments'],
    'metric:payRate': ['table:bills', 'table:payments'],
    'board:operations': ['table:models', 'metric:revenue', 'metric:received'],
    'metric:completion': ['table:models', 'metric:revenue'],
    'metric:receivedRate': ['metric:revenue', 'metric:received'],
  };
  const deps = DEPS[item.id] ?? chain.map(n => n.id);
  const h = headline(item, d);
  return [
    ...chain.map(n => ({ ...n, self: false, on: deps.includes(n.id) })),
    { id: item.id, label: item.name, meta: GROUP_LABEL[groupOf(item)], amount: h?.text ?? item.valueLabel ?? '', icon: item.kind === 'board' ? 'board' : 'metric', self: true, on: true },
  ];
}
