import { derive, type Derived, type ModelStat } from '../../../core/data/derive.ts';
import type { DataHubData } from '../../../core/data/types.ts';
import { monthLabel, pct, wan, wanLabel } from '../../../core/data/format.ts';
import { BOARD_LAYOUTS } from './boards.ts';
import type { BoardId, WidgetConfig } from './types.ts';

/**
 * 「问数据」的本地回答：按关键词匹配演示数据，不调用任何模型。
 * 由 B 版 answer.ts 移植，补上：
 * - ok：是否命中（兜底回答、问到不存在的型号时为 false）；
 * - board：对应看板（兜底时为 operations，但 ok=false，不应生成看板）；
 * - sources：引用的数据资产 id（与 buildCatalog 的 id 一致）；
 * - widgets：生成看板时飞进草稿网格的组件，取 board 布局里前 4 个非地球组件；没匹配上时为空数组。
 */

export interface AnswerFigure { label: string; value: number; kind: 'wan' | 'pct' | 'count'; unit?: string }

export interface AnswerBar { key: string; label: string; value: number; display: string; model?: string; hi?: boolean }

export type AnswerChart =
  | { kind: 'bars'; label: string; items: AnswerBar[] }
  | { kind: 'progress'; label: string; items: AnswerBar[] }
  | { kind: 'line'; label: string; labels: string[]; values: number[]; display: string[]; model?: string; hi?: number };

export interface Answer {
  query: string;
  title: string;
  /** 带 **强调** 标记的一段话 */
  text: string;
  figures: AnswerFigure[];
  chart: AnswerChart | null;
  /** 命中的关键词，展示在卡片底部 */
  matched: string[];
  /** 相关看板的资产 id */
  board?: string;
  fallback?: boolean;
}

export interface DAnswer extends Answer { board: BoardId; widgets: WidgetConfig[]; ok: boolean; sources: string[] }

type Draft = Omit<Answer, 'board'> & { board?: BoardId; sources: string[] };

const CN_NUM: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12 };
const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const has = (s: string, words: string[]) => words.filter(w => s.includes(w));
const uniq = (xs: string[]) => [...new Set(xs)];
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function findMonth(q: string, fy: number) {
  const m1 = q.match(/(\d{4})[-/.年](\d{1,2})/);
  if (m1) return `${m1[1]}-${m1[2].padStart(2, '0')}`;
  const m2 = q.match(/(\d{1,2})\s*月/);
  if (m2) return `${fy}-${m2[1].padStart(2, '0')}`;
  const m3 = q.match(/(十[一二]|[一二三四五六七八九十])\s*月/);
  if (m3 && CN_NUM[m3[1]]) return `${fy}-${String(CN_NUM[m3[1]]).padStart(2, '0')}`;
  return null;
}

const rankOf = <T,>(xs: T[], x: T, f: (v: T) => number) => [...xs].sort((a, b) => f(b) - f(a)).indexOf(x) + 1;

/**
 * 问题里出现了「像型号编号」的词（与现有型号同前缀，例如 HX-07），但数据里没有这个型号。
 * 返回这个词（原样大写）；没有则返回 null。
 */
function unknownModel(q: string, data: DataHubData): string | null {
  const ids = data.models.map(m => m.id);
  const prefixes = uniq(ids.map(id => alnum(id).replace(/\d+$/, '')).filter(p => p.length >= 1));
  if (!prefixes.length) return null;
  const known = new Set(ids.map(alnum));
  const re = new RegExp(`(${prefixes.map(escape).join('|')})[\\s-]?(\\d{1,3})`, 'gi');
  for (const m of q.matchAll(re)) {
    const token = `${m[1]}${m[2]}`.toLowerCase();
    if (!known.has(token)) return `${m[1].toUpperCase()}-${m[2]}`;
  }
  return null;
}

/** 推荐问题：至少 4 条，随数据变化（型号、月份取自数据） */
export function suggestedQuestions(d: Derived): string[] {
  const first = d.models[0]?.id;
  const low = [...d.models].sort((a, b) => a.completion - b.completion)[0];
  const lastMonth = d.billsByMonth[d.billsByMonth.length - 1]?.month;
  return uniq([
    first ? `${first} 回款怎么样` : '',
    '合同付款进度如何',
    '哪个分系统支出最多',
    low && d.models.length > 1 ? `${low.id} 为什么完成率最低` : '',
    lastMonth ? `${monthLabel(lastMonth)}报账情况` : '每月报账多少',
    '年度目标完成了多少',
    '还有多少待付款',
  ].filter(Boolean));
}

function match(query: string, d: Derived, data: DataHubData): Draft {
  const q = query.trim();
  const s = q.toLowerCase().replace(/\s+/g, '');
  const sa = alnum(q);
  const base = { query: q } as const;

  const kw = {
    received: has(s, ['回款', '收款', '到账', '回笼']),
    completion: has(s, ['完成', '目标', '达成']),
    revenue: has(s, ['收入', '营收', '趋势', '月度', '每月']),
    contract: has(s, ['合同', '履约']),
    pay: has(s, ['付款', '已付', '待付', '未付', '欠款', '支付']),
    system: has(s, ['分系统', '系统']),
    dept: has(s, ['部门', '科室']),
    bill: has(s, ['报账', '报销', '支出', '花了', '花费', '成本', '单据']),
    why: has(s, ['为什么', '原因', '为何']),
  };

  const missing = unknownModel(q, data);
  if (missing && !d.models.some(m => sa.includes(alnum(m.id)))) {
    return {
      ...base, title: '没有这个型号', fallback: true, matched: [], sources: [],
      text: `演示数据里没有型号 ${missing}。现有型号是 ${d.options.models.join('、') || '（空）'}，可以换一个型号再问。`,
      figures: [], chart: null,
    };
  }

  const model = d.models.find(m => sa.includes(alnum(m.id))) ?? d.models.find(m => s.includes(m.dept));
  const contract = d.contracts.find(c => s.includes(c.name.replace(/合同$/, '')) || sa.includes(alnum(c.id)));
  const system = d.options.systems.find(x => s.includes(x) || (x.replace('分系统', '').length >= 2 && s.includes(x.replace('分系统', ''))));
  const month = findMonth(q, d.meta.fiscalYear);

  const modelBars = (f: (m: ModelStat) => number, fmt: (v: number) => string, hi?: string): AnswerBar[] =>
    d.models.map(m => ({ key: m.id, label: m.id, value: f(m), display: fmt(f(m)), model: m.id, hi: m.id === hi }));

  /* 1. 具体合同 */
  if (contract) {
    const c = contract;
    return {
      ...base, title: c.name, board: 'contracts', matched: [c.name], sources: ['table:contracts', 'table:bills', 'table:payments'],
      text: `${c.name}（${c.id}）合同额 ${wanLabel(c.amount)}，已报账 **${wanLabel(c.billed)}**，占合同额 ${pct(c.billRate)}；已付款 **${wanLabel(c.paid)}**，付款进度 ${pct(c.payRate)}。共关联 ${c.bills.length} 张报账单，往来单位是${c.unit}。`,
      figures: [{ label: '合同额', value: c.amount, kind: 'wan' }, { label: '已付款', value: c.paid, kind: 'wan' }, { label: '付款进度', value: c.payRate, kind: 'pct' }],
      chart: { kind: 'bars', label: '合同额、已报账与已付款（万元）', items: [
        { key: 'amount', label: '合同额', value: c.amount, display: wan(c.amount) },
        { key: 'billed', label: '已报账', value: c.billed, display: wan(c.billed) },
        { key: 'paid', label: '已付款', value: c.paid, display: wan(c.paid), hi: true },
      ] },
    };
  }

  /* 2. 具体型号 */
  if (model) {
    const m = model;
    if (kw.received.length) {
      const best = [...d.models].sort((a, b) => b.receivedRate - a.receivedRate)[0];
      const rank = rankOf(d.models, m, x => x.receivedRate);
      return {
        ...base, title: `${m.id} 回款`, board: 'operations', matched: [m.id, ...kw.received], sources: ['table:models', 'metric:receivedRate'],
        text: `${m.id} 今年已回款 **${wanLabel(m.received)}**，占已确认收入 ${wanLabel(m.revenue)}的 **${pct(m.receivedRate)}**，还有 ${wanLabel(m.revenue - m.received)}待回款。${d.models.length < 2 ? '' : best.id === m.id ? `在 ${d.models.length} 个型号里回款率最高。` : `在 ${d.models.length} 个型号里排第 ${rank}，最高的是 ${best.id}（${pct(best.receivedRate)}）。`}`,
        figures: [{ label: '已回款', value: m.received, kind: 'wan' }, { label: '回款率', value: m.receivedRate, kind: 'pct' }, { label: '待回款', value: m.revenue - m.received, kind: 'wan' }],
        chart: { kind: 'bars', label: '各型号回款率', items: modelBars(x => x.receivedRate, v => pct(v), m.id) },
      };
    }
    if (kw.revenue.length && !kw.completion.length) {
      const peakI = m.monthly.indexOf(Math.max(...m.monthly));
      return {
        ...base, title: `${m.id} 月度收入`, board: 'operations', matched: [m.id, ...kw.revenue], sources: ['table:models', 'metric:revenue'],
        text: `${m.id} 近 ${d.months.length} 个月收入合计 **${wanLabel(sum(m.monthly, v => v))}**，其中 ${d.monthLabels[peakI]}最高，为 **${wanLabel(m.monthly[peakI])}**。全年已确认收入 ${wanLabel(m.revenue)}。`,
        figures: [{ label: '全年收入', value: m.revenue, kind: 'wan' }, { label: '单月最高', value: m.monthly[peakI], kind: 'wan' }, { label: '目标完成率', value: m.completion, kind: 'pct' }],
        chart: { kind: 'line', label: `${m.id} 月度收入（万元）`, labels: d.monthLabels, values: m.monthly, display: m.monthly.map(v => wan(v)), model: m.id, hi: peakI },
      };
    }
    if (kw.bill.length || kw.pay.length) {
      const sub = derive(data, { models: [m.id] });
      return {
        ...base, title: `${m.id} 报账与付款`, board: 'expenses', matched: [m.id, ...kw.bill, ...kw.pay], sources: ['table:bills', 'table:payments'],
        text: `${m.id} 共有 ${sub.spend.billCount} 张报账单，报账 **${wanLabel(sub.spend.billed)}**，已付款 ${wanLabel(sub.spend.paid)}，付款比例 **${pct(sub.spend.payRate)}**。${sub.bySystem[0] ? `支出集中在${sub.bySystem[0].key}。` : ''}`,
        figures: [{ label: '报账', value: sub.spend.billed, kind: 'wan' }, { label: '已付款', value: sub.spend.paid, kind: 'wan' }, { label: '付款比例', value: sub.spend.payRate, kind: 'pct' }],
        chart: { kind: 'bars', label: '按分系统报账（万元）', items: sub.bySystem.map(g => ({ key: g.key, label: g.key, value: g.billed, display: wan(g.billed), model: m.id })) },
      };
    }
    // 默认：目标完成（问「为什么」时补一句按月节奏的对比，全部来自数据）
    const low = [...d.models].sort((a, b) => a.completion - b.completion)[0];
    const n = Math.max(1, m.monthly.length);
    const avg = sum(m.monthly, v => v) / n;
    const gap = Math.max(0, m.target - m.revenue);
    const best = [...d.models].sort((a, b) => b.completion - a.completion)[0];
    const why = kw.why.length && gap > 0 && avg > 0
      ? `近 ${n} 个月月均收入 **${wanLabel(avg)}**${best && best.id !== m.id ? `，完成率最高的 ${best.id} 是 ${pct(best.completion)}` : ''}；按这个节奏，补齐差额还要约 ${(gap / avg).toFixed(1)} 个月。`
      : '';
    return {
      ...base, title: `${m.id} 目标完成`, board: 'operations', matched: [m.id, ...kw.completion, ...kw.why], sources: ['table:models', 'metric:completion'],
      text: `${m.id} 年度目标 ${wanLabel(m.target)}，已确认收入 **${wanLabel(m.revenue)}**，完成率 **${pct(m.completion)}**，距目标还差 ${wanLabel(gap)}。回款率 ${pct(m.receivedRate)}。${low.id === m.id && d.models.length > 1 ? '它是目前完成率最低的型号。' : ''}${why}`,
      figures: [{ label: '年度目标', value: m.target, kind: 'wan' }, { label: '完成率', value: m.completion, kind: 'pct' }, { label: '回款率', value: m.receivedRate, kind: 'pct' }],
      chart: kw.why.length
        ? { kind: 'line', label: `${m.id} 月度收入（万元）`, labels: d.monthLabels, values: m.monthly, display: m.monthly.map(v => wan(v)), model: m.id, hi: m.monthly.indexOf(Math.max(...m.monthly)) }
        : { kind: 'progress', label: '各型号目标完成率', items: modelBars(x => x.completion, v => pct(v), m.id) },
    };
  }

  /* 3. 具体分系统 */
  if (system) {
    const sub = derive(data, { systems: [system] });
    const byComp = new Map<string, number>();
    sub.bills.forEach(b => byComp.set(b.component, (byComp.get(b.component) ?? 0) + b.amount));
    return {
      ...base, title: system, board: 'expenses', matched: [system], sources: ['table:bills', 'table:payments'],
      text: `${system}共有 ${sub.spend.billCount} 张报账单，报账 **${wanLabel(sub.spend.billed)}**，已付款 **${wanLabel(sub.spend.paid)}**，待付 ${wanLabel(sub.spend.unpaid)}。`,
      figures: [{ label: '报账', value: sub.spend.billed, kind: 'wan' }, { label: '已付款', value: sub.spend.paid, kind: 'wan' }, { label: '单据', value: sub.spend.billCount, kind: 'count', unit: '张' }],
      chart: { kind: 'bars', label: '按组件报账（万元）', items: [...byComp].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, label: k, value: v, display: wan(v) })) },
    };
  }

  /* 3.5 某月收入 */
  if (month && kw.revenue.length && !kw.bill.length) {
    const i = d.months.indexOf(month);
    const label = monthLabel(month);
    if (i >= 0) {
      const pt = d.monthlyRevenue[i];
      const top = [...d.models].sort((a, b) => b.monthly[i] - a.monthly[i])[0];
      return {
        ...base, title: `${label}收入`, board: 'operations', matched: [label, ...kw.revenue], sources: ['table:models', 'metric:revenue'],
        text: `${label}，${d.models.length} 个型号收入合计 **${wanLabel(pt.total)}**，其中 ${top.id} 最多，为 **${wanLabel(top.monthly[i])}**，占当月的 ${pct(pt.total ? top.monthly[i] / pt.total : 0)}。`,
        figures: [{ label: `${label}收入`, value: pt.total, kind: 'wan' }, { label: top.id, value: top.monthly[i], kind: 'wan' }, { label: '全年完成率', value: d.business.completion, kind: 'pct' }],
        chart: { kind: 'bars', label: `${label}各型号收入（万元）`, items: d.models.map(m => ({ key: m.id, label: m.id, value: m.monthly[i], display: wan(m.monthly[i]), model: m.id, hi: m.id === top.id })) },
      };
    }
  }

  /* 4. 某月报账 */
  if (month && (kw.bill.length || kw.pay.length || !kw.revenue.length)) {
    const rows = d.bills.filter(b => b.month === month);
    const label = monthLabel(month);
    const big = [...rows].sort((a, b) => b.amount - a.amount)[0];
    const billed = sum(rows, b => b.amount), paid = sum(rows, b => b.paid);
    return {
      ...base, title: `${label}报账`, board: 'expenses', matched: [label, ...kw.bill], sources: ['table:bills', 'table:payments'],
      text: rows.length
        ? `${label}共有 **${rows.length} 张**报账单，报账 **${wanLabel(billed)}**，已付款 ${wanLabel(paid)}，待付 ${wanLabel(billed - paid)}。金额最大的一张是「${big.summary}」，${wanLabel(big.amount)}。`
        : `${label}没有报账单。有报账的月份是${d.billsByMonth.map(x => x.label).join('、')}。`,
      figures: [{ label: '报账', value: billed, kind: 'wan' }, { label: '已付款', value: paid, kind: 'wan' }, { label: '单据', value: rows.length, kind: 'count', unit: '张' }],
      chart: { kind: 'bars', label: '各月报账（万元）', items: d.billsByMonth.map(x => ({ key: x.month, label: x.label, value: x.billed, display: wan(x.billed), hi: x.month === month })) },
    };
  }

  /* 5. 合同整体 */
  if (kw.contract.length) {
    const amount = sum(d.contracts, c => c.amount), billed = sum(d.contracts, c => c.billed), paid = sum(d.contracts, c => c.paid);
    const slow = [...d.contracts].sort((a, b) => a.payRate - b.payRate)[0];
    return {
      ...base, title: '合同付款进度', board: 'contracts', matched: [...kw.contract, ...kw.pay], sources: ['table:contracts', 'table:payments', 'metric:payRate'],
      text: `${d.contracts.length} 份合同共 ${wanLabel(amount)}，已报账 ${wanLabel(billed)}，已付款 **${wanLabel(paid)}**，按合同额算付款进度 **${pct(amount ? paid / amount : 0)}**。${slow ? `进度最慢的是${slow.name}，为 ${pct(slow.payRate)}。` : ''}`,
      figures: [{ label: '合同额', value: amount, kind: 'wan' }, { label: '已付款', value: paid, kind: 'wan' }, { label: '付款进度', value: amount ? paid / amount : 0, kind: 'pct' }],
      chart: { kind: 'progress', label: '各合同付款进度', items: d.contracts.map(c => ({ key: c.id, label: c.name.replace(/合同$/, ''), value: c.payRate, display: pct(c.payRate), hi: c.id === slow?.id })) },
    };
  }

  /* 6. 分系统排名 */
  if (kw.system.length) {
    const top = d.bySystem[0], second = d.bySystem[1];
    return {
      ...base, title: '分系统支出', board: 'expenses', matched: kw.system, sources: ['table:bills', 'metric:billed'],
      text: top ? `${top.key}支出最多，报账 **${wanLabel(top.billed)}**，占全部报账的 **${pct(d.spend.billed ? top.billed / d.spend.billed : 0)}**。${second ? `其次是${second.key}，${wanLabel(second.billed)}。` : ''}` : '目前没有报账数据。',
      figures: top ? [{ label: top.key, value: top.billed, kind: 'wan' }, { label: '占比', value: d.spend.billed ? top.billed / d.spend.billed : 0, kind: 'pct' }, { label: '分系统', value: d.bySystem.length, kind: 'count', unit: '个' }] : [],
      chart: { kind: 'bars', label: '各分系统报账（万元）', items: d.bySystem.map(g => ({ key: g.key, label: g.key.replace('分系统', ''), value: g.billed, display: wan(g.billed), hi: g === top })) },
    };
  }

  /* 7. 部门 */
  if (kw.dept.length) {
    const top = d.byDept[0];
    return {
      ...base, title: '部门支出', board: 'expenses', matched: kw.dept, sources: ['table:bills', 'metric:billed'],
      text: top ? `${top.key}报账最多，共 ${top.count} 张，**${wanLabel(top.billed)}**，已付款 ${wanLabel(top.paid)}。全部 ${d.byDept.length} 个部门合计报账 ${wanLabel(d.spend.billed)}。` : '目前没有报账数据。',
      figures: top ? [{ label: top.key, value: top.billed, kind: 'wan' }, { label: '已付款', value: top.paid, kind: 'wan' }, { label: '部门', value: d.byDept.length, kind: 'count', unit: '个' }] : [],
      chart: { kind: 'bars', label: '各部门报账（万元）', items: d.byDept.map(g => ({ key: g.key, label: g.key, value: g.billed, display: wan(g.billed), hi: g === top })) },
    };
  }

  /* 8. 待付款 */
  if (kw.pay.length) {
    const open = d.bills.filter(b => b.unpaid > 0).sort((a, b) => b.unpaid - a.unpaid);
    const none = d.bills.filter(b => b.status === '未付款').length;
    return {
      ...base, title: '待付款', board: 'contracts', matched: kw.pay, sources: ['table:payments', 'metric:unpaid', 'metric:payRate'],
      text: open.length ? `目前待付款 **${wanLabel(d.spend.unpaid)}**，涉及 ${open.length} 张报账单，其中 ${none} 张还没有付款。待付最多的是 ${open[0].id}「${open[0].summary}」，**${wanLabel(open[0].unpaid)}**。` : '所有报账单都已付清。',
      figures: [{ label: '待付款', value: d.spend.unpaid, kind: 'wan' }, { label: '已付款', value: d.spend.paid, kind: 'wan' }, { label: '付款比例', value: d.spend.payRate, kind: 'pct' }],
      chart: { kind: 'bars', label: '待付金额最多的单据（万元）', items: open.slice(0, 5).map((b, i) => ({ key: b.id, label: b.id.replace(/^BZD-\d{4}-/, '#'), value: b.unpaid, display: wan(b.unpaid), model: b.model, hi: i === 0 })) },
    };
  }

  /* 9. 回款整体 */
  if (kw.received.length) {
    const sorted = [...d.models].sort((a, b) => b.receivedRate - a.receivedRate);
    return {
      ...base, title: '回款', board: 'operations', matched: kw.received, sources: ['table:models', 'metric:received', 'metric:receivedRate'],
      text: `全部型号已回款 **${wanLabel(d.business.received)}**，占收入的 **${pct(d.business.receivedRate)}**。回款率最高的是 ${sorted[0]?.id}（${pct(sorted[0]?.receivedRate ?? 0)}），最低的是 ${sorted[sorted.length - 1]?.id}（${pct(sorted[sorted.length - 1]?.receivedRate ?? 0)}）。`,
      figures: [{ label: '已回款', value: d.business.received, kind: 'wan' }, { label: '回款率', value: d.business.receivedRate, kind: 'pct' }, { label: '待回款', value: d.business.revenue - d.business.received, kind: 'wan' }],
      chart: { kind: 'bars', label: '各型号回款率', items: modelBars(x => x.receivedRate, v => pct(v)) },
    };
  }

  /* 10. 目标完成 */
  if (kw.completion.length) {
    const low = [...d.models].sort((a, b) => a.completion - b.completion)[0];
    return {
      ...base, title: '年度目标', board: 'operations', matched: kw.completion, sources: ['table:models', 'metric:completion'],
      text: `年度目标 ${wanLabel(d.business.target)}，已确认收入 **${wanLabel(d.business.revenue)}**，完成率 **${pct(d.business.completion)}**，还差 ${wanLabel(d.business.gap)}。${low ? `${low.id} 完成率最低，为 ${pct(low.completion)}。` : ''}`,
      figures: [{ label: '年度目标', value: d.business.target, kind: 'wan' }, { label: '已完成', value: d.business.revenue, kind: 'wan' }, { label: '完成率', value: d.business.completion, kind: 'pct' }],
      chart: { kind: 'progress', label: '各型号目标完成率', items: modelBars(x => x.completion, v => pct(v), low?.id) },
    };
  }

  /* 11. 收入趋势 */
  if (kw.revenue.length) {
    const totals = d.monthlyRevenue.map(x => x.total);
    const peakI = totals.indexOf(Math.max(...totals));
    return {
      ...base, title: '月度收入', board: 'operations', matched: kw.revenue, sources: ['table:models', 'metric:revenue'],
      text: `近 ${totals.length} 个月收入合计 **${wanLabel(sum(totals, v => v))}**，${d.monthLabels[peakI]}最高，为 **${wanLabel(totals[peakI])}**。全年已确认收入 ${wanLabel(d.business.revenue)}。`,
      figures: [{ label: '全年收入', value: d.business.revenue, kind: 'wan' }, { label: '单月最高', value: totals[peakI], kind: 'wan' }, { label: '完成率', value: d.business.completion, kind: 'pct' }],
      chart: { kind: 'line', label: '月度收入（万元）', labels: d.monthLabels, values: totals, display: totals.map(v => wan(v)), hi: peakI },
    };
  }

  /* 12. 报账整体 */
  if (kw.bill.length) {
    const peak = [...d.billsByMonth].sort((a, b) => b.billed - a.billed)[0];
    return {
      ...base, title: '报账', board: 'expenses', matched: kw.bill, sources: ['table:bills', 'metric:billed'],
      text: `今年共 ${d.spend.billCount} 张报账单，报账 **${wanLabel(d.spend.billed)}**，已付款 ${wanLabel(d.spend.paid)}，付款比例 **${pct(d.spend.payRate)}**。${peak ? `报账最多的月份是${peak.label}，${wanLabel(peak.billed)}。` : ''}`,
      figures: [{ label: '报账', value: d.spend.billed, kind: 'wan' }, { label: '已付款', value: d.spend.paid, kind: 'wan' }, { label: '单据', value: d.spend.billCount, kind: 'count', unit: '张' }],
      chart: { kind: 'bars', label: '各月报账（万元）', items: d.billsByMonth.map(x => ({ key: x.month, label: x.label, value: x.billed, display: wan(x.billed), hi: x === peak })) },
    };
  }

  return {
    ...base, title: '没有匹配到', fallback: true, matched: [], sources: [],
    text: `演示数据里没有和「${q}」直接对应的内容。这里按关键词回答型号、回款、目标、合同、付款、分系统、部门和月份报账相关的问题，可以换个问法试试。`,
    figures: [], chart: null,
  };
}

/** 生成看板时飞进草稿网格的组件：board 布局里前 4 个非地球组件（复制一份，避免改到布局常量） */
function widgetsFor(board: BoardId): WidgetConfig[] {
  return Object.values(BOARD_LAYOUTS[board].slots)
    .filter((w): w is WidgetConfig => !!w && w.kind !== 'globe')
    .slice(0, 4)
    .map(w => ({ ...w }));
}

export function answerFor(question: string, d: Derived, data: DataHubData): DAnswer {
  const r = match(question, d, data);
  const ok = !r.fallback;
  const board: BoardId = r.board ?? 'operations';
  return { ...r, board, ok, sources: ok ? r.sources : [], widgets: ok ? widgetsFor(board) : [] };
}
