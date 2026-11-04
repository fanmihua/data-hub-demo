import type { ComponentType, SVGProps } from 'react';
import {
  ArrowRight, ArrowUp, ArrowUpRight, Check, ChevronRight, Clock3, Command, CornerDownLeft, Database, FileText, Gauge, Globe,
  GripVertical, History, House, LayoutDashboard, LayoutGrid, Layers, Link2, ListFilter, Maximize2, MessagesSquare, Minimize2, Moon,
  Orbit, PencilLine, Pin, Plus, Receipt, RotateCcw, Search, SlidersHorizontal, Sparkles, Star, Sun, Table2, Trash2, Undo2, Wallet, X, Inbox,
  type LucideProps,
} from 'lucide-react';

/**
 * D 版图标：统一用 lucide，线宽 1.6（不随尺寸缩放），尺寸只用 16 / 20 两档。
 * 一律 aria-hidden；可点的图标按钮自己写 aria-label。
 */
export interface IconProps { size?: 16 | 20; className?: string }

const make = (C: ComponentType<LucideProps>, name: string) => {
  const Icon = ({ size = 16, className }: IconProps) => (
    <C size={size} strokeWidth={1.6} absoluteStrokeWidth className={`vd-ic${className ? ` ${className}` : ''}`} aria-hidden="true" focusable="false" />
  );
  Icon.displayName = name;
  return Icon;
};

export const IconWelcome = make(House, 'IconWelcome');
export const IconChat = make(MessagesSquare, 'IconChat');
export const IconAssets = make(Database, 'IconAssets');
export const IconBoard = make(LayoutDashboard, 'IconBoard');
export const IconSun = make(Sun, 'IconSun');
export const IconMoon = make(Moon, 'IconMoon');
export const IconSettings = make(SlidersHorizontal, 'IconSettings');
export const IconSearch = make(Search, 'IconSearch');
export const IconCommand = make(Command, 'IconCommand');
export const IconArrowUp = make(ArrowUp, 'IconArrowUp');
export const IconArrowRight = make(ArrowRight, 'IconArrowRight');
export const IconArrowUpRight = make(ArrowUpRight, 'IconArrowUpRight');
export const IconSparkle = make(Sparkles, 'IconSparkle');
export const IconClose = make(X, 'IconClose');
export const IconPlus = make(Plus, 'IconPlus');
export const IconEdit = make(PencilLine, 'IconEdit');
export const IconFullscreen = make(Maximize2, 'IconFullscreen');
export const IconExitFullscreen = make(Minimize2, 'IconExitFullscreen');
export const IconReplay = make(RotateCcw, 'IconReplay');
export const IconFilter = make(ListFilter, 'IconFilter');
export const IconTable = make(Table2, 'IconTable');
export const IconCards = make(LayoutGrid, 'IconCards');
export const IconChevronRight = make(ChevronRight, 'IconChevronRight');
export const IconStar = make(Star, 'IconStar');
export const IconClock = make(Clock3, 'IconClock');
export const IconGlobe = make(Globe, 'IconGlobe');
export const IconOrbit = make(Orbit, 'IconOrbit');
export const IconBill = make(Receipt, 'IconBill');
export const IconPayment = make(Wallet, 'IconPayment');
export const IconContract = make(FileText, 'IconContract');
export const IconLink = make(Link2, 'IconLink');
export const IconCheck = make(Check, 'IconCheck');
export const IconGrip = make(GripVertical, 'IconGrip');
export const IconTrash = make(Trash2, 'IconTrash');
export const IconPin = make(Pin, 'IconPin');
export const IconUndo = make(Undo2, 'IconUndo');
export const IconLayers = make(Layers, 'IconLayers');
export const IconHistory = make(History, 'IconHistory');
export const IconMetric = make(Gauge, 'IconMetric');
export const IconEnter = make(CornerDownLeft, 'IconEnter');
export const IconInbox = make(Inbox, 'IconInbox');

/**
 * 标志：深色圆角方块 + 一条倾斜轨道 + 一颗主色卫星（呼应地球轨道）。
 * 不是图标库里的图标，尺寸自由。
 */
export function LogoMark({ size = 32, ...rest }: { size?: number } & Omit<SVGProps<SVGSVGElement>, 'width' | 'height'>) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" focusable="false" className="vd-logo-mark" {...rest}>
      <defs>
        <linearGradient id="vd-logo-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1B2233" />
          <stop offset="1" stopColor="#0B0F19" />
        </linearGradient>
        <radialGradient id="vd-logo-planet" cx=".38" cy=".32" r=".75">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity=".95" />
          <stop offset=".55" stopColor="#C9D2E3" stopOpacity=".55" />
          <stop offset="1" stopColor="#8E9AB3" stopOpacity=".2" />
        </radialGradient>
      </defs>
      <rect x=".5" y=".5" width="31" height="31" rx="9" fill="url(#vd-logo-bg)" />
      <rect x=".5" y=".5" width="31" height="31" rx="9" fill="none" stroke="rgba(255,255,255,.14)" />
      <circle cx="16" cy="16" r="6" fill="url(#vd-logo-planet)" />
      <ellipse cx="16" cy="16" rx="11.2" ry="4.6" transform="rotate(-24 16 16)" fill="none" stroke="rgba(255,255,255,.42)" strokeWidth="1" />
      <circle cx="26" cy="11.2" r="2.1" style={{ fill: 'var(--accent)' }} />
      <circle cx="26" cy="11.2" r="3.6" style={{ fill: 'var(--accent)' }} opacity=".28" />
    </svg>
  );
}
