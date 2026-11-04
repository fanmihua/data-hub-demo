import type { Bill, Contract, DataHubData, Domain, Model } from './types';
import { monthLabel } from './format.ts';

/** 看板筛选条件。全部可选；未填即不限。 */
export interface DataFilter {
  /** 型号编号列表，例如 ['HX-01'] */
  models?: string[];
  /** 'all' | 'q3' | 'q4' | 'YYYY-MM' */
  period?: string;
  systems?: string[];
  depts?: string[];
}

export type PaymentStatus = '已付清' | '部分付款' | '未付款';

export interface BillRow extends Bill {
  paid: number;
  unpaid: number;
  status: PaymentStatus;
  contractName: string | null;
  month: string;
}

export interface ModelStat {
  id: string;
  dept: string;
  target: number;
  revenue: number;
  received: number;
  /** revenue / target */
  completion: number;
  /** received / revenue */
  receivedRate: number;
  /** 与 months 对齐的月度收入（元） */
  monthly: number[];
  /** 该型号的报账、付款（元） */
  billed: number;
  paid: number;
}

export interface MonthPoint {
  month: string;
  label: string;
  total: number;
  byModel: Record<string, number>;
}

export interface GroupStat {
  key: string;
  billed: number;
  paid: number;
  count: number;
}

export interface ContractStat extends Contract {
  billed: number;
  paid: number;
  /** billed / amount */
  billRate: number;
  /** paid / amount */
  payRate: number;
  bills: BillRow[];
}

export interface FlowNode {
  id: string;
  label: string;
  /** 第几列，从 0 开始 */
  column: number;
  value: number;
  kind: 'model' | 'system' | 'contract' | 'status';
}

export interface FlowLink {
  source: string;
  target: string;
  value: number;
}

export interface Derived {
  meta: DataHubData['meta'];
  filter: Required<DataFilter>;
  months: string[];
  monthLabels: string[];
  business: { target: number; revenue: number; received: number; completion: number; receivedRate: number; gap: number };
  models: ModelStat[];
  monthlyRevenue: MonthPoint[];
  spend: {
    billed: number; paid: number; unpaid: number; payRate: number;
    billCount: number; paymentCount: number;
    contractCount: number; contractAmount: number;
  };
  bills: BillRow[];
  billsByMonth: { month: string; label: string; billed: number; paid: number }[];
  bySystem: GroupStat[];
  byDept: GroupStat[];
  byModel: GroupStat[];
  byStatus: { status: PaymentStatus; count: number; amount: number }[];
  contracts: ContractStat[];
  /** 型号 → 分系统 → 付款状态（已付 / 未付）的资金流向，单位元 */
  flow: { nodes: FlowNode[]; links: FlowLink[] };
  /** 合同（或无合同的院内支出）→ 已付 / 未付 */
  contractFlow: { nodes: FlowNode[]; links: FlowLink[] };
  domains: (Domain & { assetCount: number })[];
  options: { models: string[]; systems: string[]; depts: string[]; periods: { value: string; label: string }[] };
}

const sum = <T,>(items: T[], f: (x: T) => number) => items.reduce((s, x) => s + f(x), 0);
const uniq = (xs: string[]) => [...new Set(xs)];

function inPeriod(date: string, period: string) {
  if (!period || period === 'all') return true;
  const m = Number(date.slice(5, 7));
  if (period === 'q1') return m <= 3;
  if (period === 'q2') return m >= 4 && m <= 6;
  if (period === 'q3') return m >= 7 && m <= 9;
  if (period === 'q4') return m >= 10;
  return date.startsWith(period);
}

function group(rows: BillRow[], key: (b: BillRow) => string): GroupStat[] {
  const map = new Map<string, GroupStat>();
  for (const b of rows) {
    const k = key(b);
    const g = map.get(k) ?? { key: k, billed: 0, paid: 0, count: 0 };
    g.billed += b.amount; g.paid += b.paid; g.count += 1;
    map.set(k, g);
  }
  return [...map.values()].sort((a, b) => b.billed - a.billed);
}

export function derive(data: DataHubData, filter: DataFilter = {}): Derived {
  const f: Required<DataFilter> = { models: filter.models ?? [], period: filter.period ?? 'all', systems: filter.systems ?? [], depts: filter.depts ?? [] };
  const contractById = new Map(data.contracts.map(c => [c.id, c]));

  const allRows: BillRow[] = data.bills.map(b => {
    const paid = sum(b.payments, p => p.amount);
    return {
      ...b,
      paid,
      unpaid: Math.max(0, b.amount - paid),
      status: paid === 0 ? '未付款' : paid >= b.amount ? '已付清' : '部分付款',
      contractName: b.contractId ? contractById.get(b.contractId)?.name ?? null : null,
      month: b.date.slice(0, 7),
    };
  });

  const rows = allRows
    .filter(b => (f.models.length === 0 || f.models.includes(b.model))
      && inPeriod(b.date, f.period)
      && (f.systems.length === 0 || f.systems.includes(b.system))
      && (f.depts.length === 0 || f.depts.includes(b.dept)))
    .sort((a, b) => b.date.localeCompare(a.date));

  // 经营：按型号筛选；期间只影响月度序列
  const pickedModels: Model[] = data.models.filter(m => f.models.length === 0 || f.models.includes(m.id));
  const months = uniq(data.models.flatMap(m => m.monthlyRevenue.map(x => x.month))).sort()
    .filter(m => inPeriod(`${m}-01`, f.period));

  const models: ModelStat[] = pickedModels.map(m => {
    const monthly = months.map(mm => m.monthlyRevenue.find(x => x.month === mm)?.amount ?? 0);
    const own = rows.filter(b => b.model === m.id);
    return {
      id: m.id, dept: m.dept, target: m.target, revenue: m.revenue, received: m.received,
      completion: m.target ? m.revenue / m.target : 0,
      receivedRate: m.revenue ? m.received / m.revenue : 0,
      monthly,
      billed: sum(own, b => b.amount), paid: sum(own, b => b.paid),
    };
  });

  const target = sum(models, m => m.target), revenue = sum(models, m => m.revenue), received = sum(models, m => m.received);

  const monthlyRevenue: MonthPoint[] = months.map((month, i) => {
    const byModel: Record<string, number> = {};
    models.forEach(m => { byModel[m.id] = m.monthly[i]; });
    return { month, label: monthLabel(month), total: sum(models, m => m.monthly[i]), byModel };
  });

  const billMonths = uniq(rows.map(b => b.month)).sort();
  const billsByMonth = billMonths.map(month => {
    const r = rows.filter(b => b.month === month);
    return { month, label: monthLabel(month), billed: sum(r, b => b.amount), paid: sum(r, b => b.paid) };
  });

  const usedContractIds = uniq(rows.map(b => b.contractId).filter((x): x is string => !!x));
  const contracts: ContractStat[] = data.contracts
    .filter(c => f.models.length === 0 && f.systems.length === 0 && f.depts.length === 0 && f.period === 'all' ? true : usedContractIds.includes(c.id))
    .map(c => {
      const own = rows.filter(b => b.contractId === c.id);
      const billed = sum(own, b => b.amount), paid = sum(own, b => b.paid);
      return { ...c, billed, paid, billRate: c.amount ? billed / c.amount : 0, payRate: c.amount ? paid / c.amount : 0, bills: own };
    });

  // 资金流向：型号 → 分系统 → 已付 / 未付
  const flowNodes: FlowNode[] = [];
  const flowLinks: FlowLink[] = [];
  const addNode = (n: FlowNode) => { const ex = flowNodes.find(x => x.id === n.id); if (ex) ex.value += n.value; else flowNodes.push({ ...n }); };
  for (const g of group(rows, b => b.model)) addNode({ id: `m:${g.key}`, label: g.key, column: 0, value: g.billed, kind: 'model' });
  for (const g of group(rows, b => b.system)) addNode({ id: `s:${g.key}`, label: g.key, column: 1, value: g.billed, kind: 'system' });
  const paidTotal = sum(rows, b => b.paid), unpaidTotal = sum(rows, b => b.unpaid);
  if (paidTotal) addNode({ id: 'st:paid', label: '已付款', column: 2, value: paidTotal, kind: 'status' });
  if (unpaidTotal) addNode({ id: 'st:unpaid', label: '待付款', column: 2, value: unpaidTotal, kind: 'status' });
  const linkMap = new Map<string, number>();
  const addLink = (s: string, t: string, v: number) => { if (v > 0) linkMap.set(`${s}|${t}`, (linkMap.get(`${s}|${t}`) ?? 0) + v); };
  for (const b of rows) {
    addLink(`m:${b.model}`, `s:${b.system}`, b.amount);
    addLink(`s:${b.system}`, 'st:paid', b.paid);
    addLink(`s:${b.system}`, 'st:unpaid', b.unpaid);
  }
  linkMap.forEach((value, k) => { const [source, target] = k.split('|'); flowLinks.push({ source, target, value }); });

  // 合同 → 已付 / 未付
  const cNodes: FlowNode[] = [];
  const cLinks: FlowLink[] = [];
  for (const b of rows) {
    const id = b.contractId ? `c:${b.contractId}` : 'c:none';
    const label = b.contractName ?? '院内支出（无合同）';
    const ex = cNodes.find(x => x.id === id);
    if (ex) ex.value += b.amount; else cNodes.push({ id, label, column: 0, value: b.amount, kind: 'contract' });
  }
  if (paidTotal) cNodes.push({ id: 'st:paid', label: '已付款', column: 1, value: paidTotal, kind: 'status' });
  if (unpaidTotal) cNodes.push({ id: 'st:unpaid', label: '待付款', column: 1, value: unpaidTotal, kind: 'status' });
  const cLinkMap = new Map<string, number>();
  for (const b of rows) {
    const id = b.contractId ? `c:${b.contractId}` : 'c:none';
    if (b.paid) cLinkMap.set(`${id}|st:paid`, (cLinkMap.get(`${id}|st:paid`) ?? 0) + b.paid);
    if (b.unpaid) cLinkMap.set(`${id}|st:unpaid`, (cLinkMap.get(`${id}|st:unpaid`) ?? 0) + b.unpaid);
  }
  cLinkMap.forEach((value, k) => { const [source, target] = k.split('|'); cLinks.push({ source, target, value }); });

  const statuses: PaymentStatus[] = ['已付清', '部分付款', '未付款'];
  const byStatus = statuses.map(status => {
    const r = rows.filter(b => b.status === status);
    return { status, count: r.length, amount: sum(r, b => b.amount) };
  });

  const billed = sum(rows, b => b.amount);
  return {
    meta: data.meta,
    filter: f,
    months,
    monthLabels: months.map(monthLabel),
    business: { target, revenue, received, completion: target ? revenue / target : 0, receivedRate: revenue ? received / revenue : 0, gap: Math.max(0, target - revenue) },
    models,
    monthlyRevenue,
    spend: {
      billed, paid: paidTotal, unpaid: unpaidTotal, payRate: billed ? paidTotal / billed : 0,
      billCount: rows.length, paymentCount: sum(rows, b => b.payments.length),
      contractCount: contracts.length, contractAmount: sum(contracts, c => c.amount),
    },
    bills: rows,
    billsByMonth,
    bySystem: group(rows, b => b.system),
    byDept: group(rows, b => b.dept),
    byModel: group(rows, b => b.model),
    byStatus,
    contracts,
    flow: { nodes: flowNodes, links: flowLinks },
    contractFlow: { nodes: cNodes, links: cLinks },
    domains: data.domains.map(d => ({ ...d, assetCount: data.assets.filter(a => a.domain === d.id).length })),
    options: {
      models: data.models.map(m => m.id),
      systems: uniq(data.bills.map(b => b.system)),
      depts: uniq(data.bills.map(b => b.dept)),
      periods: [
        { value: 'all', label: `${data.meta.fiscalYear} 全年` },
        { value: 'q3', label: '第三季度' },
        { value: 'q4', label: '第四季度' },
        ...uniq(data.bills.map(b => b.date.slice(0, 7))).sort().map(m => ({ value: m, label: monthLabel(m) })),
      ],
    },
  };
}
