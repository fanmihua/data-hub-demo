import type { ComponentType } from 'react';
import {
  ArrowLeftRight, CalendarRange, ChartArea, ChartColumn, ChartLine, ChevronDown, CircleDashed, Hourglass, Keyboard,
  MoveDiagonal2, SquareDashed, Table2, type LucideProps,
} from 'lucide-react';
import type { IconProps } from '../../ui/icons';

/**
 * 看板页额外用到的几个图标：和 ui/icons 同一个图标库、同一线宽（1.6，不随尺寸缩放），尺寸只用 16 / 20。
 * 放在这里是为了不改共享的 ui/icons.tsx。
 */
const make = (C: ComponentType<LucideProps>, name: string) => {
  const Icon = ({ size = 16, className }: IconProps) => (
    <C size={size} strokeWidth={1.6} absoluteStrokeWidth className={`vd-ic${className ? ` ${className}` : ''}`} aria-hidden="true" focusable="false" />
  );
  Icon.displayName = name;
  return Icon;
};

export const IconChevronDown = make(ChevronDown, 'IconChevronDown');
export const IconResize = make(MoveDiagonal2, 'IconResize');
export const IconWaiting = make(Hourglass, 'IconWaiting');
export const IconLine = make(ChartLine, 'IconLine');
export const IconArea = make(ChartArea, 'IconArea');
export const IconColumn = make(ChartColumn, 'IconColumn');
export const IconTableView = make(Table2, 'IconTableView');
export const IconPeriod = make(CalendarRange, 'IconPeriod');
export const IconSwap = make(ArrowLeftRight, 'IconSwap');
export const IconSlot = make(SquareDashed, 'IconSlot');
export const IconKeyboard = make(Keyboard, 'IconKeyboard');
export const IconPartial = make(CircleDashed, 'IconPartial');
