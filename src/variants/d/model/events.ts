import type { Derived } from '../../../core/data/derive.ts';
import type { TickerEvent } from './types.ts';

/**
 * 消息条事件：把已有的报账单和付款记录排成一条时间线（规范第 4.7 节第 4 条）。
 * 每条都带它自己的日期，按日期从新到旧；同一天里付款排在报账前面。
 * 只用 d.bills（已按筛选条件过滤），所以型号筛选、换数据后跟着变。
 */
export function tickerEvents(d: Derived): TickerEvent[] {
  const out: TickerEvent[] = [];
  for (const b of d.bills) {
    out.push({ id: b.id, date: b.date, kind: 'bill', model: b.model, text: `${b.model} ${b.system}报账：${b.summary}`, amount: b.amount });
    for (const p of b.payments) {
      out.push({ id: p.id, date: p.date, kind: 'payment', model: b.model, text: `${b.model} 付款给${b.unit}：${b.summary}`, amount: p.amount });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || (a.kind === b.kind ? b.id.localeCompare(a.id) : a.kind === 'payment' ? -1 : 1));
}
