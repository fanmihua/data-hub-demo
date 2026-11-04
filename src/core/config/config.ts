/**
 * 风格配置：三版共用。默认值在 public/config/theme.json，
 * 用户在「风格与数据」面板里的修改保存在浏览器 localStorage。
 */
export type VariantId = 'a' | 'b' | 'c' | 'd';
export type ThemeMode = 'light' | 'dark' | 'system';
export type FxLevel = 'full' | 'subtle' | 'off';
export type Density = 'comfortable' | 'compact';

export interface SiteConfig {
  variant: VariantId;
  mode: ThemeMode;
  /** 'auto' 表示用当前版本的默认主题色；也可以是预设 id 或 #RRGGBB */
  accent: string;
  fx: FxLevel;
  density: Density;
}

export interface AccentPreset {
  id: string;
  name: string;
  light: string;
  dark: string;
}

export const ACCENTS: AccentPreset[] = [
  { id: 'aerospace-blue', name: '航天蓝', light: '#2D5ED4', dark: '#6E9BFB' },
  { id: 'electric-violet', name: '电光紫', light: '#6A45F0', dark: '#A48CFF' },
  { id: 'aurora-cyan', name: '极光青', light: '#0B8A9E', dark: '#3CC9DB' },
  { id: 'ignition-orange', name: '尾焰橙', light: '#E0541A', dark: '#FF7A45' },
  { id: 'signal-green', name: '测控绿', light: '#0F7B5F', dark: '#3CC79A' },
  { id: 'rocket-red', name: '箭体红', light: '#C8322B', dark: '#F0645C' },
];

/** 列表顺序就是方案切换条与配置面板里的顺序；D 排第一，也是默认方案 */
export const VARIANTS: { id: VariantId; name: string; short: string; tagline: string; defaultAccent: string }[] = [
  { id: 'd', name: '数据舱', short: 'D', tagline: '一屏应用：问答生成看板、资产列表、可配置的驾驶舱看板', defaultAccent: 'aerospace-blue' },
  { id: 'a', name: '白昼测控', short: 'A', tagline: '工程细线、蓝图网格、点阵地球，像白天的测控大厅', defaultAccent: 'aerospace-blue' },
  { id: 'b', name: '极光智能', short: 'B', tagline: '会呼吸的光球和问答式检索，前沿 AI 产品的质感', defaultAccent: 'electric-violet' },
  { id: 'c', name: '轨道叙事', short: 'C', tagline: '滚动讲完一年的经费流向，大字、大数和轨道动画', defaultAccent: 'ignition-orange' },
];

/** 默认：方案 D、暗色。public/config/theme.json 可以覆盖 */
export const DEFAULT_CONFIG: SiteConfig = { variant: 'd', mode: 'dark', accent: 'auto', fx: 'full', density: 'comfortable' };

export function normalizeConfig(input: Partial<SiteConfig> | null | undefined): SiteConfig {
  const c = { ...DEFAULT_CONFIG, ...(input ?? {}) };
  if (!['a', 'b', 'c', 'd'].includes(c.variant)) c.variant = 'd';
  if (!['light', 'dark', 'system'].includes(c.mode)) c.mode = DEFAULT_CONFIG.mode;
  if (!['full', 'subtle', 'off'].includes(c.fx)) c.fx = 'full';
  if (!['comfortable', 'compact'].includes(c.density)) c.density = 'comfortable';
  if (typeof c.accent !== 'string' || !(c.accent === 'auto' || /^#[0-9a-f]{6}$/i.test(c.accent) || ACCENTS.some(a => a.id === c.accent))) c.accent = 'auto';
  return c;
}

const hexToRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
};
const rgbToHex = (r: number, g: number, b: number) => '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (hex: string, toward: string, t: number) => {
  const a = hexToRgb(hex), b = hexToRgb(toward);
  return rgbToHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
};
const luminance = (hex: string) => {
  const [r, g, b] = hexToRgb(hex).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** 解析出当前明暗下实际使用的主题色 */
export function resolveAccent(config: SiteConfig, dark: boolean) {
  const id = config.accent === 'auto' ? VARIANTS.find(v => v.id === config.variant)!.defaultAccent : config.accent;
  const preset = ACCENTS.find(a => a.id === id);
  const base = preset ? (dark ? preset.dark : preset.light) : dark ? mix(id, '#ffffff', 0.32) : id;
  const rgb = hexToRgb(base);
  return {
    id: preset ? preset.id : 'custom',
    name: preset ? preset.name : '自定义',
    hex: base,
    rgb: `${rgb[0]} ${rgb[1]} ${rgb[2]}`,
    /** 放在主题色上的文字颜色 */
    contrast: luminance(base) > 0.42 ? '#0b0d12' : '#ffffff',
  };
}

export const FX_INTENSITY: Record<FxLevel, number> = { full: 1, subtle: 0.5, off: 0 };
