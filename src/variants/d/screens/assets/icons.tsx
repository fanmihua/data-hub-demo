import type { ComponentType } from 'react';
import { ChartColumn, SearchX, type LucideProps } from 'lucide-react';

/**
 * 资产页额外用到的图标，做法与 ui/icons.tsx 相同（lucide，线宽 1.6，16 / 20 两档，aria-hidden）。
 * 共享图标直接从 ui/icons 转出，本页统一从这里引用。
 */
export * from '../../ui/icons';

const make = (C: ComponentType<LucideProps>, name: string) => {
  const Icon = ({ size = 16, className }: { size?: 16 | 20; className?: string }) => (
    <C size={size} strokeWidth={1.6} absoluteStrokeWidth className={`vd-ic${className ? ` ${className}` : ''}`} aria-hidden="true" focusable="false" />
  );
  Icon.displayName = name;
  return Icon;
};

export const IconChart = make(ChartColumn, 'IconChart');
export const IconNoResult = make(SearchX, 'IconNoResult');
