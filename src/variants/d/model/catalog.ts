import type { Derived } from '../../../core/data/derive.ts';
import type { DataHubData, Domain } from '../../../core/data/types.ts';
import { dateTimeLabel, pct, wan } from '../../../core/data/format.ts';
import { isBoardId } from './boards.ts';
import { lastMonths, METRIC_KEYS, METRICS, metricSeries, metricText, metricValue } from './metrics.ts';
import type { BoardId, CatalogField, CatalogItem } from './types.ts';

/**
 * 资产目录（规范第 4.5 节、第 4.7 节第 3 条）。全部从数据配置派生，不编造：
 * - 看板：data.assets，id 为 `board:<assetId>`；
 * - 数据表：`table:contracts`、`table:bills`、`table:payments`、`table:models`，记录数直接计数；
 * - 指标：`metric:<MetricKey>`，数值来自 derive；
 * - 筹备中业务域：`planned:<domainId>`，status 为 'planned'，没有趋势与记录数。
 *   CatalogKind 只有 board / table / metric 三种，筹备中占位行记为 'metric'，界面上请按 status 区分。
 *
 * trend 一律取近 6 个月（以 d.months 为准，缺失的月份补 0）：
 * 数据表按月金额，指标按月取值，看板按对应主题的月度金额。
 * owner 取同一业务域里看板资产的负责部门。
 */

const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
const maxDate = (dates: string[]) => dates.reduce((m, x) => (x > m ? x : m), '');

const BOARD_FIELDS: Record<BoardId, CatalogField[]> = {
  operations: [
    { name: '型号', type: '编号', desc: '型号编号，例如 HX-01' },
    { name: '年度目标', type: '数值', desc: '年度收入目标（元）' },
    { name: '确认收入', type: '数值', desc: '年内已确认收入（元）' },
    { name: '已回款', type: '数值', desc: '年内已回款（元）' },
    { name: '月度收入', type: '数值', desc: '按月确认的收入（元）' },
  ],
  contracts: [
    { name: '合同编号', type: '编号', desc: '合同唯一编号' },
    { name: '合同金额', type: '数值', desc: '合同总额（元）' },
    { name: '已报账', type: '数值', desc: '关联报账单金额合计（元）' },
    { name: '已付款', type: '数值', desc: '关联付款金额合计（元）' },
    { name: '付款进度', type: '数值', desc: '已付款 ÷ 合同金额' },
  ],
  expenses: [
    { name: '报账单号', type: '编号', desc: '报账单唯一编号' },
    { name: '分系统', type: '文本', desc: '支出所属分系统' },
    { name: '部门', type: '文本', desc: '报账部门' },
    { name: '报账金额', type: '数值', desc: '单据金额（元）' },
    { name: '报账日期', type: '日期', desc: '报账日期' },
  ],
};

const TABLE_FIELDS: Record<'contracts' | 'bills' | 'payments' | 'models', CatalogField[]> = {
  contracts: [
    { name: '合同编号', type: '编号', desc: '例如 HT-2026-001' },
    { name: '合同名称', type: '文本', desc: '合同全称' },
    { name: '往来单位', type: '文本', desc: '签约对方单位' },
    { name: '合同金额', type: '数值', desc: '合同总额（元）' },
    { name: '签订日期', type: '日期', desc: 'YYYY-MM-DD' },
  ],
  bills: [
    { name: '报账单号', type: '编号', desc: '例如 BZD-2026-001' },
    { name: '报账日期', type: '日期', desc: 'YYYY-MM-DD' },
    { name: '型号', type: '编号', desc: '支出所属型号' },
    { name: '分系统', type: '文本', desc: '支出所属分系统' },
    { name: '组件', type: '文本', desc: '分系统下的组件' },
    { name: '部门', type: '文本', desc: '报账部门' },
    { name: '经费范围', type: '文本', desc: '院内、院外集团内或集团外' },
    { name: '合同编号', type: '编号', desc: '关联合同，可为空' },
    { name: '往来单位', type: '文本', desc: '收款单位' },
    { name: '摘要', type: '文本', desc: '报账事由' },
    { name: '科目', type: '文本', desc: '会计科目' },
    { name: '凭证号', type: '编号', desc: '记账凭证编号' },
    { name: '金额', type: '数值', desc: '报账金额（元）' },
  ],
  payments: [
    { name: '付款编号', type: '编号', desc: '例如 FK-001-1' },
    { name: '报账单号', type: '编号', desc: '付款所属报账单' },
    { name: '付款日期', type: '日期', desc: 'YYYY-MM-DD' },
    { name: '付款金额', type: '数值', desc: '本次付款（元）' },
    { name: '付款账户', type: '文本', desc: '付款银行账户' },
  ],
  models: [
    { name: '型号', type: '编号', desc: '例如 HX-01' },
    { name: '负责部门', type: '文本', desc: '型号牵头部门' },
    { name: '年度目标', type: '数值', desc: '年度收入目标（元）' },
    { name: '确认收入', type: '数值', desc: '年内已确认收入（元）' },
    { name: '已回款', type: '数值', desc: '年内已回款（元）' },
    { name: '月度收入', type: '数值', desc: '按月确认的收入（元）' },
  ],
};

export function buildCatalog(data: DataHubData, d: Derived): CatalogItem[] {
  const months = lastMonths(d, 6);
  const asOf = dateTimeLabel(data.meta.asOf);
  const fallbackDomain: Domain | undefined = data.domains.find(x => x.status === 'ready') ?? data.domains[0];

  /** 看板主题 → 业务域（看板资产所在的域） */
  const domainOfBoard = (board: BoardId) => {
    const asset = data.assets.find(a => a.id === board);
    return data.domains.find(x => x.id === asset?.domain) ?? fallbackDomain;
  };
  const ownerOf = (domainId: string | undefined) => data.assets.find(a => a.domain === domainId)?.owner ?? '待定';
  const place = (board: BoardId) => {
    const dom = domainOfBoard(board);
    return { domainId: dom?.id ?? '', domainName: dom?.name ?? '未分配', owner: ownerOf(dom?.id) };
  };

  const payments = data.bills.flatMap(b => b.payments.map(p => ({ ...p, bill: b.id })));
  const byMonth = <T,>(rows: T[], date: (x: T) => string, amount: (x: T) => number) =>
    months.map(m => sum(rows.filter(r => date(r).startsWith(m)), amount));
  const revenueTrend = metricSeries(d, 'revenue', months) ?? months.map(() => 0);

  const items: CatalogItem[] = [];

  /* 看板 */
  for (const a of data.assets) {
    const dom = data.domains.find(x => x.id === a.domain);
    const boardId = isBoardId(a.id) ? a.id : undefined;
    let trend: number[], trendLabel: string, valueLabel: string | null;
    if (boardId === 'operations') {
      trend = revenueTrend; trendLabel = '月度确认收入（元）'; valueLabel = `完成率 ${pct(d.business.completion)}`;
    } else if (boardId === 'contracts') {
      trend = byMonth(payments, p => p.date, p => p.amount); trendLabel = '月度付款金额（元）'; valueLabel = `付款率 ${pct(d.spend.payRate)}`;
    } else {
      trend = byMonth(data.bills, b => b.date, b => b.amount); trendLabel = '月度报账金额（元）'; valueLabel = `报账 ${wan(d.spend.billed)} 万元`;
    }
    items.push({
      id: `board:${a.id}`, kind: 'board', name: a.name, desc: a.desc,
      domainId: a.domain, domainName: dom?.name ?? a.domain, owner: a.owner, updated: a.updated,
      records: null, valueLabel, trend, trendLabel,
      status: 'ready', boardId, fields: boardId ? BOARD_FIELDS[boardId] : [],
    });
  }

  /* 数据表 */
  const contractSum = sum(data.contracts, c => c.amount);
  items.push({
    id: 'table:contracts', kind: 'table', name: '合同', desc: '合同台账：编号、名称、往来单位、金额与签订日期。',
    ...place('contracts'), updated: maxDate(data.contracts.map(c => c.signed)) || asOf,
    records: data.contracts.length, valueLabel: `${wan(contractSum)} 万元`,
    trend: byMonth(data.contracts, c => c.signed, c => c.amount), trendLabel: '月度签订金额（元）',
    status: 'ready', fields: TABLE_FIELDS.contracts,
  });
  items.push({
    id: 'table:bills', kind: 'table', name: '报账单', desc: '每一张报账单的型号、分系统、部门、往来单位、科目与金额。',
    ...place('expenses'), updated: maxDate(data.bills.map(b => b.date)) || asOf,
    records: data.bills.length, valueLabel: `${wan(sum(data.bills, b => b.amount))} 万元`,
    trend: byMonth(data.bills, b => b.date, b => b.amount), trendLabel: '月度报账金额（元）',
    status: 'ready', fields: TABLE_FIELDS.bills,
  });
  items.push({
    id: 'table:payments', kind: 'table', name: '付款记录', desc: '报账单下的每一笔付款：日期、金额与付款账户。',
    ...place('contracts'), updated: maxDate(payments.map(p => p.date)) || asOf,
    records: payments.length, valueLabel: `${wan(sum(payments, p => p.amount))} 万元`,
    trend: byMonth(payments, p => p.date, p => p.amount), trendLabel: '月度付款金额（元）',
    status: 'ready', fields: TABLE_FIELDS.payments,
  });
  items.push({
    id: 'table:models', kind: 'table', name: '型号经营', desc: '各型号的年度目标、确认收入、回款与月度收入。',
    ...place('operations'), updated: asOf,
    records: data.models.length, valueLabel: `${wan(sum(data.models, m => m.revenue))} 万元`,
    trend: revenueTrend, trendLabel: '月度确认收入（元）',
    status: 'ready', fields: TABLE_FIELDS.models,
  });

  /* 指标 */
  for (const key of METRIC_KEYS) {
    const meta = METRICS[key];
    const series = metricSeries(d, key, months);
    items.push({
      id: `metric:${key}`, kind: 'metric', name: meta.label, desc: `口径：${meta.desc}。`,
      ...place(meta.board), updated: asOf,
      records: null, valueLabel: metricText(key, metricValue(d, key)),
      trend: series ?? revenueTrend,
      trendLabel: series ? (meta.unit === 'pct' ? '月末累计值' : '月度金额（元）') : '月度确认收入（回款没有月度明细）',
      status: 'ready',
      fields: meta.unit === 'pct'
        ? meta.desc.split(' ÷ ').map((n, i) => ({ name: n, type: '数值' as const, desc: i === 0 ? '分子（元）' : '分母（元）' }))
        : [{ name: meta.label, type: '数值', desc: meta.desc + '（元）' }],
    });
  }

  /* 筹备中业务域 */
  for (const dom of data.domains.filter(x => x.status === 'planned')) {
    items.push({
      id: `planned:${dom.id}`, kind: 'metric', name: `${dom.name}数据`, desc: `${dom.desc}。业务域筹备中，暂无可用资产。`,
      domainId: dom.id, domainName: dom.name, owner: ownerOf(dom.id), updated: '—',
      records: null, valueLabel: null, trend: [], trendLabel: '筹备中',
      status: 'planned', fields: [],
    });
  }

  return items;
}
