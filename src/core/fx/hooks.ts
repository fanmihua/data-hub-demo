import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * 元素是否进入视口。once=true 时进入一次后保持 true（用于入场动画）。
 * 注意：入场动画必须从「可见的静止状态」出发，不要把内容默认设成 opacity:0 等它触发。
 */
export function useInView<T extends Element>(ref: RefObject<T | null>, { once = true, threshold = 0.15, rootMargin = '0px 0px -10% 0px' } = {}) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setInView(true); if (once) io.disconnect(); }
      else if (!once) setInView(false);
    }, { threshold, rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, once, threshold, rootMargin]);
  return inView;
}

/** 元素尺寸（CSS 像素），用 ResizeObserver 跟踪 */
export function useElementSize<T extends Element>(ref: RefObject<T | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize(s => (s.width === width && s.height === height ? s : { width, height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/**
 * 统一的 requestAnimationFrame 循环：
 * - active=false、标签页隐藏、元素离开视口时自动暂停；
 * - dt 上限 1000/15 ms，切回标签页时画面不会跳；
 * - fps 可限制为 30 等。
 * 回调拿到 (time 秒, dt 秒)。
 */
export function useRafLoop(callback: (time: number, dt: number) => void, { active = true, fps = 60, target }: { active?: boolean; fps?: number; target?: RefObject<Element | null> } = {}) {
  const cb = useRef(callback);
  cb.current = callback;
  useEffect(() => {
    if (!active) return;
    let raf = 0, last = 0, acc = 0, time = 0, visible = true, running = true;
    const minStep = 1000 / fps;
    let io: IntersectionObserver | undefined;
    if (target?.current && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
      io.observe(target.current);
    }
    const loop = (now: number) => {
      if (!running) return;
      raf = requestAnimationFrame(loop);
      if (document.hidden || !visible) { last = now; return; }
      const delta = last ? Math.min(now - last, 1000 / 15) : 16;
      last = now;
      acc += delta;
      if (acc + 0.5 < minStep) return;
      const dt = acc / 1000;
      acc = 0;
      time += dt;
      cb.current(time, dt);
    };
    raf = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(raf); io?.disconnect(); };
  }, [active, fps, target]);
}

/**
 * 聚光灯：容器上挂一个 pointermove（rAF 合并），
 * 给容器内带 data-spot 的元素写入 --mx / --my（相对该元素的像素坐标）。
 * 只在精确指针设备上启用。CSS 用 radial-gradient(… at var(--mx) var(--my), …) 画光。
 */
export function useSpotlight<T extends HTMLElement>(ref: RefObject<T | null>, enabled = true) {
  useEffect(() => {
    const root = ref.current;
    if (!root || !enabled || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let raf = 0, x = 0, y = 0;
    const paint = () => {
      raf = 0;
      root.querySelectorAll<HTMLElement>('[data-spot]').forEach(el => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${x - r.left}px`);
        el.style.setProperty('--my', `${y - r.top}px`);
      });
    };
    const on = (e: PointerEvent) => { x = e.clientX; y = e.clientY; if (!raf) raf = requestAnimationFrame(paint); };
    root.addEventListener('pointermove', on, { passive: true });
    return () => { root.removeEventListener('pointermove', on); cancelAnimationFrame(raf); };
  }, [ref, enabled]);
}

/** 当前设备像素比，上限 cap（默认 2） */
export const dpr = (cap = 2) => Math.min(cap, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);

/** 读取 CSS 变量的计算值（用于把主题色传给 canvas / WebGL） */
export function cssVar(name: string, el: Element = document.documentElement) {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

/** 任意 CSS 颜色 → [r,g,b,a]（0–1），借助 1×1 canvas，支持 oklch/color-mix 等 */
let probe: CanvasRenderingContext2D | null = null;
export function colorToRgba(color: string): [number, number, number, number] {
  if (!probe) { const c = document.createElement('canvas'); c.width = c.height = 1; probe = c.getContext('2d', { willReadFrequently: true }); }
  if (!probe) return [0, 0, 0, 1];
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = '#000';
  probe.fillStyle = color;
  probe.fillRect(0, 0, 1, 1);
  const d = probe.getImageData(0, 0, 1, 1).data;
  return [d[0] / 255, d[1] / 255, d[2] / 255, d[3] / 255];
}
