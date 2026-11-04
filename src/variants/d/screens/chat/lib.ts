import type { BoardId, WidgetConfig } from '../../model/types';

/** 问答页内部共用的类型与小工具 */

/** 一轮问答：q 是问题；live=true 时播放回答（思考 → 逐词浮现 → 图表生长 → 来源与操作）；build=true 时播完自动生成看板 */
export interface Exchange { id: number; q: string; live: boolean; build?: boolean }

/** 「生成看板」时组件飞出的起点（视口坐标）：大数字各格、图表区、整张回答卡 */
export interface SourceRects { figs: DOMRect[]; chart: DOMRect | null; card: DOMRect }

/** 右栏草稿：来自哪一轮回答、对应哪张看板、按顺序飞入的组件；nonce 每次生成都变，用来重播拼装 */
export interface Draft { exId: number; q: string; board: BoardId; widgets: WidgetConfig[]; from: SourceRects | null; nonce: number }

export interface Token { text: string; strong: boolean }

/** 把带 **强调** 标记的句子切成「词」，用于逐词浮现。中文用 Intl.Segmenter，强调部分整体保留，标点并入前一个词。 */
export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  const parts = text.split(/\*\*(.+?)\*\*/g);
  const seg = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('zh-CN', { granularity: 'word' }) : null;
  parts.forEach((p, i) => {
    if (!p) return;
    if (i % 2 === 1) { out.push({ text: p, strong: true }); return; }
    const words = seg ? Array.from(seg.segment(p), s => s.segment) : (p.match(/[一-鿿]{1,2}|[^一-鿿]+/g) ?? [p]);
    words.forEach(w => {
      if (/^[，。、；：！？）」』,.;:!?)\s]+$/.test(w) && out.length && !out[out.length - 1].strong) out[out.length - 1].text += w;
      else out.push({ text: w, strong: false });
    });
  });
  return out;
}

/** 去掉 ** 标记，给读屏用 */
export const plain = (text: string) => text.replace(/\*\*/g, '');

/** 逐词浮现：每个词的错开时间（毫秒）与单个词的动画时长 */
export const WORD_MS = 32;
export const WORD_DUR = 620;

/** 「生成看板」时组件飞行的错开时间与时长 */
export const FLY_STAGGER = 120;
export const FLY_DUR = 760;

/** 草稿网格里占两列的组件 */
export const isWide = (w: WidgetConfig) => w.kind === 'timeseries' || w.kind === 'sankey' || w.kind === 'contracts' || w.kind === 'timeline' || w.kind === 'bars';

export const KIND_LABEL: Record<WidgetConfig['kind'], string> = {
  kpi: '指标卡', stream: '数据流', globe: '地球', timeseries: '时间序列', bars: '条形图', sankey: '桑基图', contracts: '合同履约', timeline: '时间线', ring: '环形图',
};
