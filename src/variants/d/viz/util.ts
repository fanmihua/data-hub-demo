import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useSite } from '../../../core/provider';

/** D 版可视化共用的小工具：尺寸、入场与重播、型号色 */

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const EASE = 'cubic-bezier(.16, 1, .3, 1)';

/** 重播事件：看板「重播动画」按钮派发 `window.dispatchEvent(new Event(VD_REPLAY))`，所有图表重新入场 */
export const VD_REPLAY = 'vd:replay';
export const replayViz = () => window.dispatchEvent(new Event(VD_REPLAY));

/**
 * 型号固定色：按数据里型号的顺序取 --vd-m1 / m2 / m3（HX-01 主色、HX-02 青、HX-03 紫），超过 3 个时循环。
 * 返回 CSS 颜色字符串，canvas 里用前要先解析（Globe 内部会解析）。
 */
export const modelColorVar = (index: number) => {
  const k = (Math.max(0, index) % 3) + 1;
  return k === 1 ? 'var(--vd-m1, var(--accent))' : k === 2 ? 'var(--vd-m2, #0E8C8C)' : 'var(--vd-m3, #835CBE)';
};

/** 型号编号 → 颜色（按当前数据里的顺序） */
export function useModelColor() {
  const { data } = useSite();
  const ids = data.models.map(m => m.id);
  return (id: string) => modelColorVar(ids.indexOf(id));
}

/**
 * 元素尺寸（CSS 像素）：挂载时在布局阶段同步量一次，首帧就能画出图表；之后用 ResizeObserver 跟踪。
 * 与底座 useElementSize 的口径相同（contentRect），只是多了首帧同步测量。
 */
export function useBox<T extends Element>(ref: RefObject<T | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      const w = Math.round(r.width * 2) / 2, h = Math.round(r.height * 2) / 2;
      setSize(s => (s.width === w && s.height === h ? s : { width: w, height: h }));
    };
    read();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(read) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [ref]);
  return size;
}

/**
 * 入场：元素进入视口时调用 play（已在视口内就在布局阶段立刻调用，不闪）。
 * - play 用 Web Animations 从隐藏态播到静止态（fill: backwards），静止态本身可见；
 * - key 变化（换图表类型、换系列）或收到 VD_REPLAY 事件时重播；
 * - enabled=false（关闭特效 / 减少动态）时什么都不做，直接显示终态。
 */
export function useEntrance(ref: RefObject<Element | null>, play: (el: Element) => Animation[], { enabled = true, ready = true, key }: { enabled?: boolean; ready?: boolean; key?: unknown } = {}) {
  const playRef = useRef(play);
  playRef.current = play;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const on = () => setTick(t => t + 1);
    window.addEventListener(VD_REPLAY, on);
    return () => window.removeEventListener(VD_REPLAY, on);
  }, [enabled]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !enabled || !ready) return;
    let anims: Animation[] = [];
    const run = () => { anims = playRef.current(el) || []; };
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) { run(); return () => anims.forEach(a => a.cancel()); }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); run(); } }, { rootMargin: '0px 0px 6% 0px' });
    io.observe(el);
    return () => { io.disconnect(); anims.forEach(a => a.cancel()); };
  }, [ref, enabled, ready, key, tick]);
}

/**
 * 常用入场：
 * - [data-draw]：描线（path 需 pathLength=1、stroke-dasharray=1）；
 * - [data-grow="x|y"]：生长（配合 CSS transform-box / transform-origin）；
 * - [data-sweep]：从左往右揭开（clip-path inset）；
 * - [data-fade]：淡入上移；
 * - [data-pop]：从 72% 放大到位并淡入（块、格子、气泡；SVG 里配合 transform-box: fill-box）。
 * 可用 data-delay（毫秒）给单个元素加延迟。
 */
export function playIn(root: Element, { duration = 900, delay = 0 }: { duration?: number; delay?: number } = {}) {
  const out: Animation[] = [];
  const extra = (el: Element) => Number(el.getAttribute('data-delay') || 0);
  root.querySelectorAll('[data-draw]').forEach((el, i) => {
    out.push(el.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration, delay: delay + extra(el) + i * 80, easing: EASE, fill: 'backwards' }));
  });
  root.querySelectorAll('[data-sweep]').forEach(el => {
    out.push(el.animate([{ clipPath: 'inset(-20px 100% -20px -20px)' }, { clipPath: 'inset(-20px -20px -20px -20px)' }], { duration, delay: delay + extra(el), easing: EASE, fill: 'backwards' }));
  });
  root.querySelectorAll('[data-grow]').forEach((el, i) => {
    const axis = el.getAttribute('data-grow') === 'x' ? 'scaleX' : 'scaleY';
    out.push(el.animate([{ transform: `${axis}(0)` }, { transform: `${axis}(1)` }], { duration: duration * 0.85, delay: delay + extra(el) + Math.min(i * 28, 360), easing: EASE, fill: 'backwards' }));
  });
  root.querySelectorAll('[data-pop]').forEach(el => {
    out.push(el.animate([{ opacity: 0, transform: 'scale(.72)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 560, delay: delay + extra(el), easing: EASE, fill: 'backwards' }));
  });
  root.querySelectorAll('[data-fade]').forEach((el, i) => {
    out.push(el.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 480, delay: delay + extra(el) + duration * 0.45 + i * 40, easing: EASE, fill: 'backwards' }));
  });
  return out;
}

/** 一串数字的签名：用于判断「换了数据」时是否需要重播 */
export const signature = (parts: (string | number)[]) => parts.join('|');

/** 估算文字宽度（px），用于留出坐标轴、标签的空间；中文按 1em，其余按 .6em */
export function textWidth(s: string, size = 12) {
  let w = 0;
  for (const ch of s) w += /[　-鿿＀-￯]/.test(ch) ? size : size * 0.6;
  return w;
}
