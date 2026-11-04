import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { ACCENTS, DEFAULT_CONFIG, FX_INTENSITY, normalizeConfig, resolveAccent, type FxLevel, type SiteConfig } from './config/config';
import { derive, type DataFilter, type Derived } from './data/derive';
import type { DataHubData } from './data/types';
import { validateData } from './data/validate';

const CONFIG_KEY = 'datahub:config';
const DATA_KEY = 'datahub:data';

const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string | null) => { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* 隐私模式等情况下忽略 */ } };

export interface FxState {
  level: FxLevel;
  /** 0 / 0.5 / 1，已考虑系统「减少动态效果」 */
  intensity: number;
  /** 系统开启了「减少动态效果」 */
  reduced: boolean;
  /** 可以播放动画（未关闭特效且系统未要求减少动态） */
  motion: boolean;
}

export interface SiteContextValue {
  config: SiteConfig;
  setConfig: (patch: Partial<SiteConfig>) => void;
  resetConfig: () => void;
  isDark: boolean;
  accent: ReturnType<typeof resolveAccent>;
  /** 浅色 ↔ 深色。传入点击坐标时用圆形扩散过渡 */
  toggleMode: (origin?: { x: number; y: number }) => void;
  fx: FxState;
  data: DataHubData;
  dataSource: 'default' | 'custom';
  /** 校验并应用新数据，返回错误列表（空数组表示已应用） */
  setData: (next: unknown) => string[];
  resetData: () => void;
  defaultData: DataHubData;
  /** 未筛选的全量派生指标 */
  derived: Derived;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
}

const SiteContext = createContext<SiteContextValue | null>(null);

export function useSite() {
  const v = useContext(SiteContext);
  if (!v) throw new Error('useSite 必须在 <SiteProvider> 内使用');
  return v;
}

/** 按筛选条件派生指标（已缓存） */
export function useDerived(filter: DataFilter = {}) {
  const { data } = useSite();
  const key = JSON.stringify(filter);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => derive(data, filter), [data, key]);
}

function readHashOverrides() {
  const q = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const theme = q.get('theme');
  const fx = q.get('fx');
  const accent = q.get('accent');
  return {
    theme: theme === 'dark' || theme === 'light' ? theme : undefined,
    fx: fx === 'full' || fx === 'subtle' || fx === 'off' ? (fx as FxLevel) : undefined,
    // 预设 id（如 signal-green）或不带 # 的 6 位色值（如 0F7B5F）
    accent: accent && (ACCENTS.some(a => a.id === accent) ? accent : /^[0-9a-f]{6}$/i.test(accent) ? `#${accent}` : undefined) || undefined,
  };
}

function useHashOverrides() {
  const [o, setO] = useState(readHashOverrides);
  useEffect(() => {
    const on = () => setO(prev => { const next = readHashOverrides(); return prev.theme === next.theme && prev.fx === next.fx && prev.accent === next.accent ? prev : next; });
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return o;
}

function clearHashParam(name: string) {
  const [path, qs = ''] = location.hash.split('?');
  const q = new URLSearchParams(qs);
  q.delete(name);
  const next = q.size ? `${path}?${q}` : path;
  history.replaceState(null, '', next || '#');
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

function useMedia(query: string) {
  const [match, setMatch] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

export function SiteProvider({ children }: { children: ReactNode }) {
  const [defaults, setDefaults] = useState<{ config: SiteConfig; data: DataHubData } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfigState] = useState<SiteConfig>(() => {
    try { return normalizeConfig(JSON.parse(read(CONFIG_KEY) || 'null')); } catch { return DEFAULT_CONFIG; }
  });
  const [customData, setCustomData] = useState<DataHubData | null>(() => {
    try { const v = JSON.parse(read(DATA_KEY) || 'null'); return v && validateData(v).length === 0 ? v : null; } catch { return null; }
  });
  const [panelOpen, setPanelOpen] = useState(false);
  const systemDark = useMedia('(prefers-color-scheme: dark)');
  const reduced = useMedia('(prefers-reduced-motion: reduce)');

  useEffect(() => {
    let alive = true;
    Promise.all([
      // 相对路径：哈希路由下文档路径恒为站点根，部署到子路径（如 GitHub Pages）也能读到
      fetch('config/theme.json').then(r => (r.ok ? r.json() : {})).catch(() => ({})),
      fetch('config/data.json').then(r => { if (!r.ok) throw new Error(`data.json ${r.status}`); return r.json(); }),
    ]).then(([theme, data]) => {
      if (!alive) return;
      const errs = validateData(data);
      if (errs.length) { setError(`默认数据有问题：${errs[0]}`); return; }
      const themeDefaults = normalizeConfig(theme);
      setDefaults({ config: themeDefaults, data });
      // 没有本地保存过风格时，用 theme.json 的默认值
      if (!read(CONFIG_KEY)) setConfigState(themeDefaults);
    }).catch(e => alive && setError(`读取配置失败：${e instanceof Error ? e.message : String(e)}`));
    return () => { alive = false; };
  }, []);

  // 测试用：网址里的 ?theme=dark|light、?fx=full|subtle|off 只影响当前页面，不写入本地存储
  const overrides = useHashOverrides();
  const mode = overrides.theme ?? config.mode;
  const fxLevel = overrides.fx ?? config.fx;
  const isDark = mode === 'dark' || (mode === 'system' && systemDark);
  const accent = useMemo(() => resolveAccent(overrides.accent ? { ...config, accent: overrides.accent } : config, isDark), [config, isDark, overrides.accent]);
  const fx: FxState = useMemo(() => {
    const intensity = reduced ? 0 : FX_INTENSITY[fxLevel];
    return { level: fxLevel, intensity, reduced, motion: intensity > 0 };
  }, [fxLevel, reduced]);

  useLayoutEffect(() => {
    const el = document.documentElement;
    el.dataset.theme = isDark ? 'dark' : 'light';
    el.dataset.variant = config.variant;
    el.dataset.fx = reduced ? 'off' : fxLevel;
    el.dataset.density = config.density;
    el.style.colorScheme = isDark ? 'dark' : 'light';
    el.style.setProperty('--accent', accent.hex);
    el.style.setProperty('--accent-rgb', accent.rgb);
    el.style.setProperty('--accent-contrast', accent.contrast);
    el.style.setProperty('--fx', String(fx.intensity));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark ? '#0a0c11' : '#fafafa');
  }, [isDark, config.variant, fxLevel, config.density, accent, fx.intensity, reduced]);

  const setConfig = useCallback((patch: Partial<SiteConfig>) => {
    setConfigState(prev => {
      const next = normalizeConfig({ ...prev, ...patch });
      write(CONFIG_KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  const resetConfig = useCallback(() => {
    write(CONFIG_KEY, null);
    setConfigState(prev => ({ ...(defaults?.config ?? DEFAULT_CONFIG), variant: prev.variant }));
  }, [defaults]);

  const toggleMode = useCallback((origin?: { x: number; y: number }) => {
    const apply = () => {
      if (overrides.theme) clearHashParam('theme');
      setConfig({ mode: isDark ? 'light' : 'dark' });
    };
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
    if (!doc.startViewTransition || reduced || config.fx === 'off') { apply(); return; }
    const x = origin?.x ?? window.innerWidth - 40, y = origin?.y ?? 32;
    const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const t = doc.startViewTransition(() => { flushSync(apply); });
    t.ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 560, easing: 'cubic-bezier(.2,1,.2,1)', pseudoElement: '::view-transition-new(root)' },
      );
    }).catch(() => {});
  }, [isDark, reduced, config.fx, setConfig, overrides.theme]);

  const data = customData ?? defaults?.data ?? null;
  const setData = useCallback((next: unknown) => {
    const errs = validateData(next);
    if (errs.length) return errs;
    setCustomData(next as DataHubData);
    write(DATA_KEY, JSON.stringify(next));
    return [];
  }, []);
  const resetData = useCallback(() => { setCustomData(null); write(DATA_KEY, null); }, []);
  const derived = useMemo(() => (data ? derive(data) : null), [data]);

  if (error) return <div className="dh-boot" role="alert"><strong>页面没能启动</strong><span>{error}</span><button onClick={() => { write(DATA_KEY, null); location.reload(); }}>清除本地数据后重试</button></div>;
  if (!defaults || !data || !derived) return <div className="dh-boot" aria-busy="true"><span className="dh-boot-dot" />正在载入配置与数据</div>;

  const value: SiteContextValue = {
    config, setConfig, resetConfig, isDark, accent, toggleMode, fx,
    data, dataSource: customData ? 'custom' : 'default', setData, resetData, defaultData: defaults.data,
    derived, panelOpen, setPanelOpen,
  };
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}
