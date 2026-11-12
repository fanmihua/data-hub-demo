import type { BoardId, BoardLayout } from './types.ts';

/**
 * 三张看板的组件配置（规范第 4.6 节、第 4.7 节第 2 条）。
 *
 * 共同骨架（一屏驾驶舱）：
 *   左栏 4 张 stream 数据流小卡 │ 中央 globe 地球主视觉 │ 右栏 kpi 大指标 + sankey / contracts
 *   底部 timeseries 月度图表 + timeline 报账时间线
 *
 * 渲染约定（给看板组件 Widget 用）：
 * - stream      metric 的当前值 + 近 6 个月迷你曲线（metricSeries）+ 较上月变化；chartType 为曲线样式
 * - kpi         metric 的当前值，大数字
 * - timeseries  metric 的月度序列；revenue 按型号分系列，其余为单系列；chartType 切换折线 / 面积 / 柱状 / 表格
 * - bars        metric 分组：revenue / received / completion / receivedRate 按型号，其余按分系统；
 *               chartType 还可以是构成分析的六种图形（treemap / stream / heatmap / sunburst / bubble / radial），按报账单拆
 * - sankey      资金流向：型号 → 分系统 → 付款状态（d.flow）
 * - contracts   合同履约条形图（d.contracts）
 * - timeline    报账时间线，点一张报账单展开付款链路
 * - ring        型号构成：metric 按型号的占比，画成分段条（原来是环形图）
 * - color       组件强调色：accent / m1–m3（型号色）/ signal（尾焰橙，慎用）。
 *               默认配置里非型号指标一律用 accent，型号色只留给按型号拆分的图（避免把「报账」读成 HX-02）
 *
 * 行高只用 fr 和 minmax()，保证 1280×720 一屏放下；超出的内容在组件内部滚动。
 * 格位对象的键顺序就是「生成看板」时组件飞入的顺序（answers.ts 取前 4 个非地球组件）。
 */

const ROWS = 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,2fr)';

export const BOARD_LAYOUTS: Record<BoardId, BoardLayout> = {
  operations: {
    id: 'operations',
    title: '经营概览',
    subtitle: '各型号的收入目标、实际收入与回款',
    columns: 'minmax(196px,.92fr) minmax(0,2.15fr) minmax(220px,1.08fr)',
    rows: ROWS,
    areas: [
      's1 globe k1',
      's2 globe k2',
      's3 globe side',
      's4 globe side',
      'main main tl',
    ],
    slots: {
      k1: { id: 'op-received', kind: 'kpi', title: '已回款', metric: 'received', color: 'accent' },
      main: { id: 'op-revenue-trend', kind: 'timeseries', title: '月度收入 · 按型号', metric: 'revenue', chartType: 'area', color: 'accent' },
      side: { id: 'op-tree', kind: 'bars', title: '报账构成', metric: 'billed', chartType: 'treemap', color: 'accent' },
      s1: { id: 'op-s-revenue', kind: 'stream', title: '月度收入', metric: 'revenue', chartType: 'area', color: 'accent' },
      k2: { id: 'op-received-rate', kind: 'kpi', title: '回款率', metric: 'receivedRate', color: 'accent' },
      s2: { id: 'op-s-completion', kind: 'stream', title: '累计完成率', metric: 'completion', chartType: 'line', color: 'accent' },
      s3: { id: 'op-s-billed', kind: 'stream', title: '报账', metric: 'billed', chartType: 'bar', color: 'accent' },
      s4: { id: 'op-s-paid', kind: 'stream', title: '付款', metric: 'paid', chartType: 'bar', color: 'accent' },
      globe: { id: 'op-globe', kind: 'globe', title: '型号轨道' },
      tl: { id: 'op-timeline', kind: 'timeline', title: '报账时间线' },
    },
  },
  contracts: {
    id: 'contracts',
    title: '合同与付款',
    subtitle: '合同履约、资金流向与每一张报账单的付款链路',
    columns: 'minmax(196px,.92fr) minmax(0,1.9fr) minmax(248px,1.3fr)',
    rows: ROWS,
    areas: [
      's1 globe k1',
      's2 globe k2',
      's3 globe side',
      's4 globe side',
      'main tl tl',
    ],
    slots: {
      side: { id: 'ct-contracts', kind: 'contracts', title: '合同履约', chartType: 'bar', color: 'accent' },
      k1: { id: 'ct-pay-rate', kind: 'kpi', title: '付款率', metric: 'payRate', color: 'accent' },
      main: { id: 'ct-paid-trend', kind: 'timeseries', title: '月度付款', metric: 'paid', chartType: 'bar', color: 'accent' },
      s1: { id: 'ct-s-billed', kind: 'stream', title: '报账', metric: 'billed', chartType: 'bar', color: 'accent' },
      k2: { id: 'ct-unpaid', kind: 'kpi', title: '待付款', metric: 'unpaid', color: 'signal' },
      s2: { id: 'ct-s-paid', kind: 'stream', title: '付款', metric: 'paid', chartType: 'bar', color: 'accent' },
      s3: { id: 'ct-s-unpaid', kind: 'stream', title: '待付款', metric: 'unpaid', chartType: 'bar', color: 'accent' },
      s4: { id: 'ct-s-pay-rate', kind: 'stream', title: '累计付款率', metric: 'payRate', chartType: 'line', color: 'accent' },
      globe: { id: 'ct-globe', kind: 'globe', title: '型号轨道' },
      tl: { id: 'ct-timeline', kind: 'timeline', title: '报账单与付款链路' },
    },
  },
  expenses: {
    id: 'expenses',
    title: '报账与支出',
    subtitle: '按分系统、部门和月份看支出构成',
    columns: 'minmax(196px,.92fr) minmax(0,2fr) minmax(236px,1.2fr)',
    rows: ROWS,
    areas: [
      's1 globe k1',
      's2 globe k2',
      's3 globe side',
      's4 globe side',
      'main main tl',
    ],
    slots: {
      side: { id: 'ex-flow', kind: 'sankey', title: '支出构成：型号 → 分系统 → 付款' },
      main: { id: 'ex-heat', kind: 'bars', title: '分系统 × 月份', metric: 'billed', chartType: 'heatmap', color: 'accent' },
      k1: { id: 'ex-billed', kind: 'kpi', title: '累计报账', metric: 'billed', color: 'accent' },
      k2: { id: 'ex-ring', kind: 'ring', title: '报账构成 · 按型号', metric: 'billed' },
      s1: { id: 'ex-s-billed', kind: 'stream', title: '报账', metric: 'billed', chartType: 'bar', color: 'accent' },
      s2: { id: 'ex-s-paid', kind: 'stream', title: '付款', metric: 'paid', chartType: 'bar', color: 'accent' },
      s3: { id: 'ex-s-unpaid', kind: 'stream', title: '待付款', metric: 'unpaid', chartType: 'bar', color: 'accent' },
      s4: { id: 'ex-s-revenue', kind: 'stream', title: '月度收入', metric: 'revenue', chartType: 'area', color: 'accent' },
      globe: { id: 'ex-stream', kind: 'bars', title: '分系统报账', metric: 'billed', chartType: 'stream', color: 'accent' },
      tl: { id: 'ex-timeline', kind: 'timeline', title: '报账时间线' },
    },
  },
};

export function isBoardId(id: string): id is BoardId {
  return Object.prototype.hasOwnProperty.call(BOARD_LAYOUTS, id);
}
