/**
 * 方案 D「数据舱」纯逻辑层校验：资产目录、看板布局、编辑器、问答、消息条。
 * 运行：node --experimental-strip-types scripts/check-variant-d.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { derive } from '../src/core/data/derive.ts';
import type { DataHubData } from '../src/core/data/types.ts';
import { buildCatalog } from '../src/variants/d/model/catalog.ts';
import { BOARD_LAYOUTS, isBoardId } from '../src/variants/d/model/boards.ts';
import { compatibleTypes, editReducer, WIDGET_LIBRARY } from '../src/variants/d/model/editor.ts';
import { answerFor, suggestedQuestions } from '../src/variants/d/model/answers.ts';
import { tickerEvents } from '../src/variants/d/model/events.ts';

const data = JSON.parse(readFileSync(new URL('../public/config/data.json', import.meta.url), 'utf8')) as DataHubData;
const d = derive(data);

/* ───────── 资产目录 ───────── */
const items = buildCatalog(data, d);
assert.equal(items.filter(i => i.kind === 'board').length, 3);
assert.equal(items.filter(i => i.kind === 'table').length, 4);
assert.ok(items.filter(i => i.kind === 'metric').length >= 5);
assert.equal(items.filter(i => i.status === 'planned').length, 4);           // 4 个筹备中业务域
assert.equal(items.find(i => i.id === 'table:bills')!.records, 12);
assert.equal(items.find(i => i.id === 'table:contracts')!.records, 4);
assert.equal(items.find(i => i.id === 'table:payments')!.records, 11);
assert.equal(items.find(i => i.id === 'metric:completion')!.valueLabel, '77.2%');
for (const i of items.filter(x => x.status === 'ready')) assert.equal(i.trend.length, 6);
assert.equal(new Set(items.map(i => i.id)).size, items.length, '资产 id 唯一');

/* ───────── 看板布局 ───────── */
for (const l of Object.values(BOARD_LAYOUTS)) {
  const names = new Set(l.areas.join(' ').split(/\s+/).filter(n => n !== '.'));
  assert.deepEqual([...names].sort(), Object.keys(l.slots).sort(), `${l.id} 格位与 areas 一致`);
  assert.equal(l.rows.split(/\s+/).length, l.areas.length);
}
assert.ok(isBoardId('operations') && !isBoardId('unknown'));

/* ───────── 编辑器 ───────── */
const L = BOARD_LAYOUTS.operations;
const [s1, s2] = Object.keys(L.slots);
const swapped = editReducer(L, { type: 'swap', a: s1, b: s2 });
assert.equal(swapped.slots[s1]!.id, L.slots[s2]!.id);
const removed = editReducer(L, { type: 'remove', slot: s1 });
assert.equal(removed.slots[s1], null);
const readded = editReducer(removed, { type: 'add', slot: s1, widget: WIDGET_LIBRARY[0] });
assert.equal(readded.slots[s1]!.kind, WIDGET_LIBRARY[0].kind);
assert.equal(editReducer(L, { type: 'add', slot: s2, widget: WIDGET_LIBRARY[0] }), L);  // 非空格位不接收
assert.deepEqual(compatibleTypes('globe'), []);
assert.deepEqual(compatibleTypes('timeseries'), ['line', 'area', 'bar', 'table']);

/* ───────── 问答 ───────── */
assert.equal(answerFor('HX-01 回款怎么样', d, data).board, 'operations');
assert.equal(answerFor('合同付款进度如何', d, data).board, 'contracts');
const sys = answerFor('哪个分系统支出最多', d, data);
assert.equal(sys.board, 'expenses'); assert.ok(sys.text.includes('动力分系统'));
const miss = answerFor('天气怎么样', d, data);
assert.equal(miss.ok, false); assert.equal(miss.widgets.length, 0);
assert.ok(suggestedQuestions(d).length >= 4);

/* ───────── 消息条 ───────── */
const ev = tickerEvents(d);
assert.equal(ev.length, 23);                                   // 12 报账 + 11 付款
assert.ok(ev.every((e, i) => i === 0 || ev[i - 1].date >= e.date));

/* ───────── 换数据：只保留 HX-02 ───────── */
const one = { ...data, models: data.models.filter(m => m.id === 'HX-02'), bills: data.bills.filter(b => b.model === 'HX-02') };
const d1 = derive(one);
assert.ok(buildCatalog(one, d1).length > 0);
assert.equal(answerFor('HX-01 回款', d1, one).ok, false);
assert.ok(tickerEvents(d1).every(e => e.model === 'HX-02'));
console.log('方案 D 逻辑层校验通过');
