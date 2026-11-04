import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useSite } from '../../core/provider';

/** C 版通用小工具：滚动进度、入场触发、型号色、canvas 取色 */

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** p 在 [start, end] 区间里走到哪儿（0–1） */
export const seg = (p: number, start: number, end: number) => clamp((p - start) / Math.max(1e-6, end - start));
export const easeOut = (t: number) => 1 - (1 - t) ** 3;
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export const EASE = 'cubic-bezier(.16, 1, .3, 1)';

/** 型号固定色：按数据里型号的顺序，依次是 墨 / 主色 / 钢蓝，全站一致 */
export function useModelColor() {
  const { data } = useSite();
  const ids = data.models.map(m => m.id).join('|');
  return useCallback((id: string) => {
    const i = ids.split('|').indexOf(id);
    return `var(--vc-m${(Math.max(0, i) % 3) + 1})`;
  }, [ids]);
}

/**
 * 滚动进度（sticky 段落）：
 * - 段落高度减一屏为可滚动距离，p = 已滚过 / 可滚动距离；
 * - 写入元素上的 --vc-p（已用 @property 注册，CSS 里用 calc/clamp 直接驱动图形）；
 * - smooth=true 时用指数插值追赶目标值，像 GSAP 的 scrub，静止后停止 rAF；
 * - enabled=false（关闭特效 / 减少动态）时直接给终态 1。
 */
export function useScrollProgress(ref: RefObject<HTMLElement | null>, onProgress?: (p: number) => void, { enabled = true, smooth = true }: { enabled?: boolean; smooth?: boolean } = {}) {
  const cb = useRef(onProgress);
  cb.current = onProgress;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!enabled) { el.style.setProperty('--vc-p', '1'); cb.current?.(1); return () => { el.style.removeProperty('--vc-p'); }; }
    let raf = 0, cur = -1, last = 0;
    const read = () => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const span = r.height - vh;
      // 段落不比一屏高（例如被 CSS 退回普通排版）时：顶部进入屏幕 3/4 处就算走完
      return span > 8 ? clamp(-r.top / span) : clamp((vh * 0.8 - r.top) / Math.max(1, vh * 0.4));
    };
    const tick = (now: number) => {
      raf = 0;
      const target = read();
      if (cur < 0 || !smooth) cur = target;
      else {
        const dt = last ? Math.min(64, now - last) : 16;
        cur += (target - cur) * (1 - Math.pow(0.82, dt / 16));
        if (Math.abs(target - cur) < 0.0006) cur = target;
      }
      last = cur === target ? 0 : now;
      el.style.setProperty('--vc-p', cur.toFixed(4));
      cb.current?.(cur);
      if (cur !== target) raf = requestAnimationFrame(tick);
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(tick); };
    on();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', on); window.removeEventListener('resize', on); };
  }, [ref, enabled, smooth]);
}

/**
 * 入场触发：元素即将进入视口（底部再往下 8%）时调用 play；挂载时已在视口内就立刻调用（布局阶段，不闪）。
 * play 里用 Web Animations 从隐藏态播到静止态（fill: backwards），静止态本身是可见的。
 * replay 变化时重新播放（例如筛选条件改变后重新描线）。
 */
export function useEnter(ref: RefObject<Element | null>, play: (el: Element) => Animation[] | void, { enabled = true, ready = true, replay }: { enabled?: boolean; ready?: boolean; replay?: unknown } = {}) {
  const playRef = useRef(play);
  playRef.current = play;
  const first = useRef(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !enabled || !ready) return;
    let anims: Animation[] = [];
    const run = () => { anims = playRef.current(el) || []; };
    const r = el.getBoundingClientRect();
    const visible = r.top < window.innerHeight && r.bottom > 0;
    if (visible || !first.current) { first.current = false; run(); return () => anims.forEach(a => a.cancel()); }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); first.current = false; run(); } }, { rootMargin: '0px 0px 8% 0px' });
    io.observe(el);
    return () => { io.disconnect(); anims.forEach(a => a.cancel()); };
  }, [ref, enabled, ready, replay]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** 常用入场：描线（[data-draw] 的 path 需 pathLength=1、dasharray=1）、生长（[data-grow="x|y"]）、淡入（[data-fade]） */
export function playDrawIn(root: Element, { delay = 0, duration = 1100 }: { delay?: number; duration?: number } = {}) {
  const out: Animation[] = [];
  root.querySelectorAll<SVGElement | HTMLElement>('[data-draw]').forEach((el, i) => {
    out.push(el.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration, delay: delay + i * 90, easing: EASE, fill: 'backwards' }));
  });
  root.querySelectorAll<SVGElement | HTMLElement>('[data-grow]').forEach((el, i) => {
    const axis = el.getAttribute('data-grow') === 'x' ? 'scaleX' : 'scaleY';
    out.push(el.animate([{ transform: `${axis}(0)` }, { transform: `${axis}(1)` }], { duration: duration * 0.8, delay: delay + i * 40, easing: EASE, fill: 'backwards' }));
  });
  root.querySelectorAll<SVGElement | HTMLElement>('[data-fade]').forEach((el, i) => {
    out.push(el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 600, delay: delay + 300 + i * 50, easing: EASE, fill: 'backwards' }));
  });
  return out;
}

/** 读取 C 版 token 的实际颜色给 canvas 用；明暗、主色、方案切换后刷新 */
export function useThemeColors<K extends string>(names: readonly K[], scope: RefObject<Element | null>) {
  const { isDark, accent, config } = useSite();
  const [colors, setColors] = useState<Record<K, string> | null>(null);
  const key = names.join(',');
  useEffect(() => {
    const el = scope.current ?? document.documentElement;
    const cs = getComputedStyle(el);
    const next = {} as Record<K, string>;
    names.forEach(n => { next[n] = cs.getPropertyValue(n).trim() || '#888'; });
    setColors(next);
  }, [isDark, accent.hex, config.variant, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return colors;
}

/**
 * 元素尺寸：挂载时在布局阶段同步量一次（首帧就能画出图表），之后用 ResizeObserver 和窗口 resize 跟踪。
 * 和底座的 useElementSize 用途相同，只是多了首帧同步测量。
 */
export function useSize<T extends Element>(ref: RefObject<T | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      setSize(s => (s.width === r.width && s.height === r.height ? s : { width: r.width, height: r.height }));
    };
    read();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(read) : null;
    ro?.observe(el);
    window.addEventListener('resize', read);
    return () => { ro?.disconnect(); window.removeEventListener('resize', read); };
  }, [ref]);
  return size;
}

/** 精确指针（鼠标）设备 */
export function useFinePointer() {
  return useMemo(() => typeof matchMedia !== 'undefined' && matchMedia('(hover: hover) and (pointer: fine)').matches, []);
}

/** 简单的确定性随机数（星点、刻度等装饰用，保证每次渲染一致） */
export function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 平滑滚到页面上的某个元素（关闭特效时瞬移） */
export function scrollToEl(el: Element | null, motion: boolean, offset = 0) {
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top, behavior: motion ? 'smooth' : ('instant' as ScrollBehavior) });
}
