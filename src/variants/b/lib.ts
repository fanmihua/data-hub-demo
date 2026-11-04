import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { href, type Page, type Route } from '../../core/route';
import { useSite } from '../../core/provider';
import type { PaymentStatus } from '../../core/data/derive';

/* ───────── 颜色 ───────── */

/** 型号系列色：按 data.models 的顺序固定分配，筛选后颜色不变 */
const MODEL_VARS = ['var(--vb-m1)', 'var(--vb-m2)', 'var(--vb-m3)', 'var(--vb-m4)'];
export function useModelColor() {
  const { data } = useSite();
  const ids = data.models.map(m => m.id);
  return useCallback((id: string) => {
    const i = ids.indexOf(id);
    return MODEL_VARS[(i < 0 ? 0 : i) % MODEL_VARS.length];
  }, [ids.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
}

export const STATUS_CLASS: Record<PaymentStatus, string> = { '已付清': 'is-ok', '部分付款': 'is-part', '未付款': 'is-none' };

/* ───────── 路由 ───────── */

/** 生成 B 版链接，并保留测试用的 ?theme / ?fx 参数 */
export function bHref(route: Route, page: Page = 'home', assetId?: string | null, extra?: Record<string, string>) {
  const keep: Record<string, string> = {};
  for (const k of ['theme', 'fx']) { const v = route.query.get(k); if (v) keep[k] = v; }
  return href('b', page, assetId, { ...keep, ...extra });
}

/* ───────── 动效 ───────── */

/**
 * 进入视口一次后返回 true。元素在触发前保持「可见的静止状态」，
 * 触发后才加上播放入场动画的类名。
 */
export function useReveal<T extends Element>(ref: RefObject<T | null>, rootMargin = '0px') {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setOn(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0, rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);
  return on;
}

export const finePointer = () => typeof matchMedia !== 'undefined' && matchMedia('(hover: hover) and (pointer: fine)').matches;

/**
 * 轻微 3D 倾斜：写入 --rx / --ry（角度）和 --gx / --gy（高光位置，百分比）。
 * 只在精确指针设备、允许动效时启用；rAF 合并写入。
 */
export function useTilt<T extends HTMLElement>(ref: RefObject<T | null>, enabled: boolean, max = 4) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || !finePointer()) return;
    let raf = 0, px = 0.5, py = 0.5;
    const paint = () => {
      raf = 0;
      el.style.setProperty('--rx', `${((0.5 - py) * max * 2).toFixed(2)}deg`);
      el.style.setProperty('--ry', `${((px - 0.5) * max * 2).toFixed(2)}deg`);
      el.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`);
      el.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`);
    };
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const leave = () => { px = 0.5; py = 0.5; if (!raf) raf = requestAnimationFrame(paint); };
    el.addEventListener('pointermove', move, { passive: true });
    el.addEventListener('pointerleave', leave);
    return () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); cancelAnimationFrame(raf); el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); };
  }, [ref, enabled, max]);
}

/** 是否 Mac，用于显示 ⌘K / Ctrl K */
export const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/* ───────── 文本 ───────── */

export interface Token { text: string; strong: boolean }

/** 把带 **强调** 标记的句子切成「词」，用于逐词浮现。中文用 Intl.Segmenter，强调部分整体保留。 */
export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  const parts = text.split(/\*\*(.+?)\*\*/g);
  const seg = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('zh-CN', { granularity: 'word' }) : null;
  parts.forEach((p, i) => {
    if (!p) return;
    if (i % 2 === 1) { out.push({ text: p, strong: true }); return; }
    const words = seg ? Array.from(seg.segment(p), s => s.segment) : (p.match(/[一-鿿]{1,2}|[^一-鿿]+/g) ?? [p]);
    // 把标点并入前一个词，避免标点单独浮现
    words.forEach(w => {
      if (/^[，。、；：！？）」』,.;:!?)\s]+$/.test(w) && out.length && !out[out.length - 1].strong) out[out.length - 1].text += w;
      else out.push({ text: w, strong: false });
    });
  });
  return out;
}

/** 去掉 ** 标记，给读屏和 aria-label 用 */
export const plain = (text: string) => text.replace(/\*\*/g, '');

/* ───────── 交互小工具 ───────── */

/**
 * 打字机轮播：依次打出、停留、删除。active=false 时返回第一句的完整文本。
 * paused=true 时（例如检索框滚出视口、标签页隐藏）停在当前字，恢复后接着打，不再空转计时器。
 */
export function useTypewriter(lines: string[], active: boolean, paused = false) {
  const [text, setText] = useState(lines[0] ?? '');
  const st = useRef({ i: 0, n: 0, dir: 1 });
  const key = lines.join('\n');
  useEffect(() => {
    st.current = { i: 0, n: 0, dir: 1 };
    setText(active && lines.length ? '' : lines[0] ?? '');
  }, [key, active]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!active || paused || !lines.length) return;
    let t = 0;
    const tick = () => {
      const s = st.current;
      const line = lines[s.i % lines.length];
      s.n = Math.max(0, Math.min(line.length, s.n + s.dir));
      setText(line.slice(0, s.n));
      let wait = s.dir > 0 ? 70 + Math.random() * 60 : 28;
      if (s.dir > 0 && s.n >= line.length) { s.dir = -1; wait = 2200; }
      else if (s.dir < 0 && s.n <= 0) { s.dir = 1; s.i = (s.i + 1) % lines.length; wait = 420; }
      t = window.setTimeout(tick, wait);
    };
    t = window.setTimeout(tick, 500);
    return () => clearTimeout(t);
  }, [key, active, paused]); // eslint-disable-line react-hooks/exhaustive-deps
  return text;
}

/** 元素是否在视口内、且标签页可见（用于暂停计时器类的循环） */
export function useOnScreen<T extends Element>(ref: RefObject<T | null>) {
  const [inView, setInView] = useState(true);
  const [shown, setShown] = useState(() => typeof document === 'undefined' || !document.hidden);
  useEffect(() => {
    const el = ref.current;
    const onVis = () => setShown(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    let io: IntersectionObserver | undefined;
    if (el && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(([e]) => setInView(e.isIntersecting));
      io.observe(el);
    }
    return () => { document.removeEventListener('visibilitychange', onVis); io?.disconnect(); };
  }, [ref]);
  return inView && shown;
}

/** 平滑滚动到元素（无动效时直接跳转） */
export function scrollToEl(el: Element | null, motion: boolean, offset = 88) {
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top, behavior: motion ? 'smooth' : 'auto' });
}

/** 上一次的值 */
export function usePrevious<T>(v: T) {
  const r = useRef<T>(v);
  useEffect(() => { r.current = v; });
  return r.current;
}
