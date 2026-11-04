import type { BoardLayout, ChartType, WidgetConfig, WidgetKind } from './types.ts';

/**
 * 看板编辑状态的纯函数（规范第 4.7 节第 2 条）。
 * 真的生效的操作：交换两个格位、删除组件、往空位放组件、改组件配置、还原。
 * 不合法的操作（格位名不存在、往非空格位添加、类型不兼容等）原样返回同一个 state 对象，
 * 调用方可以用 === 判断「什么也没发生」。
 */

export type EditAction =
  | { type: 'swap'; a: string; b: string }
  | { type: 'remove'; slot: string }
  | { type: 'add'; slot: string; widget: WidgetConfig }
  | { type: 'update'; slot: string; patch: Partial<WidgetConfig> }
  | { type: 'reset'; layout: BoardLayout };

const COMPATIBLE: Record<WidgetKind, ChartType[]> = {
  timeseries: ['line', 'area', 'bar', 'table'],
  stream: ['line', 'area', 'bar'],
  bars: ['bar', 'table'],
  contracts: ['bar', 'table'],
  kpi: [],
  globe: [],
  sankey: [],
  timeline: [],
  ring: [],
};

/** 组件可以切换的图表类型；空数组表示不能换类型（配置面板隐藏这一项） */
export function compatibleTypes(kind: WidgetKind): ChartType[] {
  return [...COMPATIBLE[kind]];
}

/** 组件库：编辑状态左侧可拖进空位的组件模板 */
export const WIDGET_LIBRARY: WidgetConfig[] = [
  { id: 'lib-kpi', kind: 'kpi', title: '指标卡', metric: 'completion', color: 'accent' },
  { id: 'lib-line', kind: 'timeseries', title: '折线 · 月度收入', metric: 'revenue', chartType: 'line', color: 'accent' },
  { id: 'lib-bars', kind: 'bars', title: '柱状 · 分系统报账', metric: 'billed', chartType: 'bar', color: 'accent' },
  { id: 'lib-sankey', kind: 'sankey', title: '桑基 · 资金流向' },
  { id: 'lib-globe', kind: 'globe', title: '地球 · 型号轨道' },
  { id: 'lib-table', kind: 'timeseries', title: '表格 · 月度报账', metric: 'billed', chartType: 'table', color: 'accent' },
  { id: 'lib-stream', kind: 'stream', title: '数据流 · 付款', metric: 'paid', chartType: 'bar', color: 'm2' },
  { id: 'lib-ring', kind: 'ring', title: '环形 · 收入构成', metric: 'revenue' },
  { id: 'lib-contracts', kind: 'contracts', title: '合同履约', chartType: 'bar', color: 'accent' },
];

const has = (state: BoardLayout, slot: string) => Object.prototype.hasOwnProperty.call(state.slots, slot);

/** 放进看板的组件需要一个看板内唯一的 id */
function uniqueId(state: BoardLayout, base: string) {
  const used = new Set(Object.values(state.slots).filter((w): w is WidgetConfig => !!w).map(w => w.id));
  let id = base, n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  return id;
}

export function editReducer(state: BoardLayout, action: EditAction): BoardLayout {
  switch (action.type) {
    case 'swap': {
      const { a, b } = action;
      if (a === b || !has(state, a) || !has(state, b)) return state;
      if (!state.slots[a] && !state.slots[b]) return state;
      return { ...state, slots: { ...state.slots, [a]: state.slots[b], [b]: state.slots[a] } };
    }
    case 'remove': {
      if (!has(state, action.slot) || !state.slots[action.slot]) return state;
      return { ...state, slots: { ...state.slots, [action.slot]: null } };
    }
    case 'add': {
      if (!has(state, action.slot) || state.slots[action.slot]) return state;
      const widget: WidgetConfig = { ...action.widget, id: uniqueId(state, `${action.widget.id}@${action.slot}`) };
      return { ...state, slots: { ...state.slots, [action.slot]: widget } };
    }
    case 'update': {
      const cur = has(state, action.slot) ? state.slots[action.slot] : null;
      if (!cur) return state;
      const { id: _id, kind, ...patch } = action.patch;
      if (kind !== undefined && kind !== cur.kind) return state;
      if (patch.chartType !== undefined && !COMPATIBLE[cur.kind].includes(patch.chartType)) return state;
      const next: WidgetConfig = { ...cur, ...patch };
      if ((Object.keys(next) as (keyof WidgetConfig)[]).every(k => next[k] === cur[k])) return state;
      return { ...state, slots: { ...state.slots, [action.slot]: next } };
    }
    case 'reset':
      return action.layout;
  }
}
