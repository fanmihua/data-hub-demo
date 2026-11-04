import type { Asset } from '../../core/data/types';

export type Focus = 'contracts' | 'expenses' | 'operations';

/** 看板侧重：已知的三个资产按 id，其余按业务域和分类推断 */
export function assetFocus(a: Asset): Focus {
  if (a.id === 'contracts' || a.id === 'expenses' || a.id === 'operations') return a.id;
  if (a.domain === 'business' || /经营|收入|回款/.test(a.category)) return 'operations';
  if (/支出|成本|报账/.test(a.category)) return 'expenses';
  return 'contracts';
}
