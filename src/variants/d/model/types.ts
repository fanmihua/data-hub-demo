/**
 * 方案 D「数据舱」的纯逻辑层类型。只有类型，没有运行时代码。
 * 视觉层（shell / ui / viz / screens）只通过这些类型协作。
 */

export type BoardId = 'contracts' | 'expenses' | 'operations';
export type MetricKey = 'revenue' | 'received' | 'billed' | 'paid' | 'unpaid' | 'completion' | 'receivedRate' | 'payRate';
export type ChartType = 'line' | 'area' | 'bar' | 'table';
export type WidgetKind = 'kpi' | 'stream' | 'globe' | 'timeseries' | 'bars' | 'sankey' | 'contracts' | 'timeline' | 'ring';
export type WidgetColor = 'accent' | 'm1' | 'm2' | 'm3' | 'signal';

export interface WidgetConfig { id: string; kind: WidgetKind; title: string; metric?: MetricKey; chartType?: ChartType; color?: WidgetColor }

/**
 * 一张看板的布局：CSS Grid 命名格位。
 * - columns / rows 直接写进 grid-template-columns / grid-template-rows；
 * - areas 每项是一行 grid-template-areas 的字符串（不含引号）；
 * - slots 的键与 areas 里出现的格位名一一对应，值为 null 表示空位。
 */
export interface BoardLayout { id: BoardId; title: string; subtitle: string; columns: string; rows: string; areas: string[]; slots: Record<string, WidgetConfig | null> }

export type CatalogKind = 'board' | 'table' | 'metric';
export interface CatalogField { name: string; type: '文本' | '数值' | '日期' | '编号'; desc: string }
export interface CatalogItem {
  id: string; kind: CatalogKind; name: string; desc: string;
  domainId: string; domainName: string; owner: string; updated: string;
  records: number | null; valueLabel: string | null;
  trend: number[]; trendLabel: string;
  status: 'ready' | 'planned'; boardId?: BoardId; fields: CatalogField[];
}

export interface TickerEvent { id: string; date: string; kind: 'bill' | 'payment'; model: string; text: string; amount: number }
