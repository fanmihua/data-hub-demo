import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { CircleCheck, CircleDashed, CircleDotDashed } from 'lucide-react';
import { useSite } from '../../core/provider';
import { useInView } from '../../core/fx/hooks';
import { NumberRoller } from '../../core/ui/NumberRoller';
import { href, type Page } from '../../core/route';
import type { PaymentStatus } from '../../core/data/derive';

/** 型号系列色：按 data.models 的顺序固定，HX-01/02/03 在全站同色 */
const MODEL_VARS = ['--va-m1', '--va-m2', '--va-m3', '--va-m4', '--va-m5'];

export function useModelColor() {
  const { data } = useSite();
  return useMemo(() => {
    const ids = data.models.map(m => m.id);
    return (id: string) => {
      const i = ids.indexOf(id);
      return `var(${MODEL_VARS[(i < 0 ? 0 : i) % MODEL_VARS.length]})`;
    };
  }, [data.models]);
}

/**
 * 首次进入视口后为 true；关闭特效时直接为 true（终态）。
 * 用法：图形默认就是可见的静止状态（例如淡色底线），played 后再补全描线 / 填充。
 */
export function useReveal<T extends Element>(threshold = 0.2) {
  const ref = useRef<T>(null);
  const { fx } = useSite();
  const seen = useInView(ref, { threshold });
  const stalled = useFramesStalled();
  return [ref, seen || !fx.motion || stalled] as const;
}

/*
 * 帧探测：页面可见却拿不到 requestAnimationFrame（例如被隐藏的预览面板、无头截图），
 * IntersectionObserver 和过渡都不会推进。这时把入场动画直接视为播完，避免截图停在半成品。
 * 正常浏览器里 rAF 16ms 内就会触发，不受影响。
 */
let stalled = false;
let probing = false;
const stallSubs = new Set<() => void>();
function probeFrames() {
  if (stalled || probing || typeof window === 'undefined') return;
  probing = true;
  let ok = false;
  requestAnimationFrame(() => { ok = true; });
  setTimeout(() => {
    probing = false;
    if (!ok && !document.hidden) { stalled = true; stallSubs.forEach(f => f()); }
  }, 700);
}
export function useFramesStalled() {
  const [s, set] = useState(stalled);
  useEffect(() => {
    const f = () => set(true);
    stallSubs.add(f);
    if (stalled) set(true); else probeFrames();
    return () => { stallSubs.delete(f); };
  }, []);
  return s;
}

/** 生成本版链接，并保留测试用的 ?theme / ?fx 网址参数 */
export function link(page: Page = 'home', assetId?: string | null, query: Record<string, string> = {}) {
  const cur = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const keep: Record<string, string> = {};
  for (const k of ['theme', 'fx', 'gl']) { const v = cur.get(k); if (v) keep[k] = v; }
  return href('a', page, assetId, { ...keep, ...query });
}

export function scrollToSection(id: string, smooth: boolean) {
  const el = document.getElementById(`va-${id}`);
  if (!el) return false;
  el.scrollIntoView({ behavior: smooth && !stalled ? 'smooth' : 'auto', block: 'start' });
  return true;
}

export const STATUS_META: Record<PaymentStatus, { cls: string; Icon: typeof CircleCheck }> = {
  '已付清': { cls: 'is-ok', Icon: CircleCheck },
  '部分付款': { cls: 'is-warn', Icon: CircleDotDashed },
  '未付款': { cls: 'is-bad', Icon: CircleDashed },
};

export function StatusBadge({ status }: { status: PaymentStatus }) {
  const { cls, Icon } = STATUS_META[status];
  return <span className={`va-status ${cls}`}><Icon size={15} strokeWidth={2} aria-hidden="true" />{status}</span>;
}

export interface LegendItem { label: string; color: string; kind?: 'line' | 'dash' | 'box' | 'dot' }

export function Legend({ items, className = '' }: { items: LegendItem[]; className?: string }) {
  return (
    <ul className={`va-legend ${className}`} aria-label="图例">
      {items.map(it => (
        <li key={it.label}>
          <i className={`va-key va-key-${it.kind ?? 'box'}`} style={{ ['--k' as string]: it.color }} aria-hidden="true" />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * 元素尺寸：挂载时同步量一次（首帧就能画图，不等 ResizeObserver），之后用 ResizeObserver 跟踪。
 */
export function useSize<T extends Element>(ref: RefObject<T | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = (width: number, height: number) => setSize(s => (Math.abs(s.width - width) < 0.5 && Math.abs(s.height - height) < 0.5 ? s : { width, height }));
    const r = el.getBoundingClientRect();
    const html = el as unknown as HTMLElement;
    set(html.offsetWidth ?? r.width, html.offsetHeight ?? r.height);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => set(entry.contentRect.width, entry.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** 一个月的累计序列 */
export const cumsum = (xs: number[]) => { let s = 0; return xs.map(v => (s += v)); };

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** 数字滚轮；拿不到动画帧时直接显示终值（共享的 NumberRoller 依赖 IntersectionObserver + rAF） */
export function Roll(props: Parameters<typeof NumberRoller>[0]) {
  const stalled = useFramesStalled();
  if (stalled) {
    const text = (props.format ?? String)(props.value);
    return <span className={`nr ${props.className ?? ''}`} role="img" aria-label={props.label ?? text}>{text}</span>;
  }
  return <NumberRoller {...props} />;
}
