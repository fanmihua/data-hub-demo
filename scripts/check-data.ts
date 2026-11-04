/**
 * 校验 public/config/data.json 的结构与业务口径。
 * 运行：npm run check:data
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { derive } from '../src/core/data/derive.ts';
import { validateData } from '../src/core/data/validate.ts';
import type { DataHubData } from '../src/core/data/types.ts';

const data = JSON.parse(readFileSync(new URL('../public/config/data.json', import.meta.url), 'utf8')) as DataHubData;
assert.deepEqual(validateData(data), [], '结构校验');

const all = derive(data);
assert.equal(all.spend.billed, 8040000, '累计报账');
assert.equal(all.spend.paid, 4880000, '累计付款');
assert.equal(data.contracts.reduce((s, c) => s + c.amount, 0), 12000000, '合同总额');
assert.equal(new Set(data.bills.map(b => b.id)).size, data.bills.length, '报账单编号唯一');
for (const bill of all.bills) {
  assert.ok(bill.paid <= bill.amount, `${bill.id}：付款不超过报账金额`);
  for (const p of bill.payments) assert.ok(p.date >= bill.date && p.date <= data.meta.asOf.slice(0, 10), `${p.id}：付款日期在报账之后、截至日之前`);
}
for (const c of all.contracts) assert.ok(c.billed <= c.amount, `${c.id}：报账不超过合同金额`);
for (const m of data.models) assert.equal(m.monthlyRevenue.reduce((s, x) => s + x.amount, 0), m.revenue, `${m.id}：月度收入合计等于年度收入`);
assert.equal(all.business.revenue, 38600000, '年度收入');
assert.equal(all.business.target, 50000000, '年度目标');
assert.equal(all.business.completion.toFixed(3), '0.772', '目标完成率');

const hx01 = derive(data, { models: ['HX-01'], systems: ['动力分系统'] });
assert.equal(hx01.spend.billed, 3600000, 'HX-01 动力分系统报账');
const nov = derive(data, { period: '2026-11' });
assert.equal(nov.spend.billed, 460000, '11 月报账');
assert.equal(nov.spend.paid, 0, '11 月付款');
const q4 = derive(data, { period: 'q4' });
assert.equal(q4.spend.billed, 3040000, '第四季度报账');

const flowIn = all.flow.links.filter(l => l.source.startsWith('m:')).reduce((s, l) => s + l.value, 0);
const flowOut = all.flow.links.filter(l => l.target.startsWith('st:')).reduce((s, l) => s + l.value, 0);
assert.equal(flowIn, all.spend.billed, '资金流向：型号流出等于报账');
assert.equal(flowOut, all.spend.billed, '资金流向：流到付款状态的合计等于报账');

console.log('数据校验通过：结构、金额汇总、付款与合同约束、月度合计、筛选口径、资金流向守恒。');
