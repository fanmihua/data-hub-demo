import type { Derived } from '../../core/data/derive';
import { pct, wanLabel } from '../../core/data/format';

/**
 * 「本页要点」：按固定规则从当前筛选后的数据里挑 3–5 条事实。
 * target 是要高亮的图表 id，focus 是图里要强调的那一项。
 */
export interface Point { id: string; text: string; target: string; focus?: string }

const share = (a: number, b: number) => (b ? a / b : 0);

export function boardPoints(asset: string, d: Derived): Point[] {
  const out: Point[] = [];
  const models = d.models;
  const low = [...models].sort((a, b) => a.completion - b.completion)[0];
  const bestRecv = [...models].sort((a, b) => b.receivedRate - a.receivedRate)[0];
  const peakRev = [...d.monthlyRevenue].sort((a, b) => b.total - a.total)[0];
  const topSys = d.bySystem[0];
  const topDept = d.byDept[0];
  const open = d.bills.filter(b => b.unpaid > 0);
  const none = d.bills.filter(b => b.status === '未付款');
  const peakBill = [...d.billsByMonth].sort((a, b) => b.billed - a.billed)[0];

  if (asset === 'operations') {
    if (models.length) out.push({ id: 'done', target: 'ops-target', text: `全年目标完成 **${pct(d.business.completion)}**，还差 ${wanLabel(d.business.gap)}。` });
    if (low && models.length > 1) out.push({ id: 'low', target: 'ops-target', focus: low.id, text: `${low.id} 完成率最低，为 **${pct(low.completion)}**。` });
    if (peakRev) out.push({ id: 'peak', target: 'ops-trend', focus: peakRev.month, text: `${peakRev.label}收入最高，为 **${wanLabel(peakRev.total)}**。` });
    if (bestRecv) out.push({ id: 'recv', target: 'ops-recv', focus: bestRecv.id, text: `回款率最高的是 ${bestRecv.id}，**${pct(bestRecv.receivedRate)}**。` });
    if (models.length) out.push({ id: 'gap', target: 'ops-recv', text: `已确认收入里还有 **${wanLabel(d.business.revenue - d.business.received)}**待回款。` });
  } else if (asset === 'contracts') {
    const slow = [...d.contracts].filter(c => c.billed > 0).sort((a, b) => a.payRate - b.payRate)[0];
    const most = [...d.contracts].sort((a, b) => b.paid - a.paid)[0];
    const noContract = d.bills.filter(b => !b.contractId).reduce((s, b) => s + b.amount, 0);
    if (d.contracts.length) out.push({ id: 'paid', target: 'ctr-main', text: `报账 ${wanLabel(d.spend.billed)}，其中已付款 **${wanLabel(d.spend.paid)}**，占 ${pct(d.spend.payRate)}。` });
    if (slow) out.push({ id: 'slow', target: 'ctr-main', focus: slow.id, text: `${slow.name}付款进度最慢，为 **${pct(slow.payRate)}**。` });
    if (most && most !== slow && most.paid > 0) out.push({ id: 'most', target: 'ctr-main', focus: most.id, text: `${most.name}已付最多，**${wanLabel(most.paid)}**。` });
    if (open.length) out.push({ id: 'open', target: 'ctr-flow', focus: 'st:unpaid', text: `待付款 **${wanLabel(d.spend.unpaid)}**，涉及 ${open.length} 张单据。` });
    if (noContract > 0) out.push({ id: 'none', target: 'ctr-flow', focus: 'c:none', text: `无合同的院内支出 ${wanLabel(noContract)}。` });
  } else {
    if (topSys) out.push({ id: 'sys', target: 'exp-system', focus: topSys.key, text: `${topSys.key}支出最多，占 **${pct(share(topSys.billed, d.spend.billed))}**。` });
    if (topDept) out.push({ id: 'dept', target: 'exp-dept', focus: topDept.key, text: `${topDept.key}报账最多，共 **${wanLabel(topDept.billed)}**。` });
    if (peakBill) out.push({ id: 'month', target: 'exp-main', focus: peakBill.month, text: `${peakBill.label}报账最多，为 **${wanLabel(peakBill.billed)}**。` });
    if (none.length) out.push({ id: 'none', target: 'bills', text: `${none.length} 张单据还没有付款，合计 **${wanLabel(none.reduce((s, b) => s + b.amount, 0))}**。` });
    if (d.spend.billCount) out.push({ id: 'rate', target: 'exp-main', text: `付款比例 **${pct(d.spend.payRate)}**，待付 ${wanLabel(d.spend.unpaid)}。` });
  }
  if (!out.length) out.push({ id: 'empty', target: 'bills', text: '当前筛选下没有数据，换个型号或期间试试。' });
  return out.slice(0, 5);
}
