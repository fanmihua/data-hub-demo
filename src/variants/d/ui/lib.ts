import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { href, type Page } from '../../../core/route';
import { useSite } from '../../../core/provider';

/**
 * D 版界面共用的小工具（不属于计划 Interfaces，供 shell / ui / screens 复用）：
 * - dHref：生成 D 版链接，并保留测试用的 ?theme / ?fx / ?accent 参数；
 * - modelColor / useModelColor：型号固定色（HX-01 主色、HX-02 青、HX-03 紫，按数据顺序循环）；
 * - useTypewriter：打字机轮播；useOnScreen：在视口内且标签页可见；
 * - isMac：⌘K / Ctrl K 文案。
 */

const KEEP = ['theme', 'fx', 'accent'];

/** 生成 D 版链接，并保留当前网址里的测试参数（?theme=dark / ?fx=off / ?accent=…） */
export function dHref(page: Page = 'home', assetId?: string | null, query?: Record<string, string>) {
  const cur = new URLSearchParams(typeof location === 'undefined' ? '' : location.hash.split('?')[1] ?? '');
  const keep: Record<string, string> = {};
  for (const k of KEEP) { const v = cur.get(k); if (v) keep[k] = v; }
  return href('d', page, assetId, { ...keep, ...query });
}

/** 搜索框聚焦事件：⌘K 在资产页时直接派发，资产页监听后聚焦搜索框 */
export const VD_FOCUS_SEARCH = 'vd:focus-search';

const MODEL_VARS = ['var(--vd-m1)', 'var(--vd-m2)', 'var(--vd-m3)'];
/** 型号序号 → 颜色（CSS 变量字符串） */
export const modelColor = (index: number) => MODEL_VARS[(Math.max(0, index)) % MODEL_VARS.length];

/** 型号编号 → 颜色，按 data.models 的顺序固定分配，筛选后颜色不变 */
export function useModelColor() {
  const { data } = useSite();
  const key = data.models.map(m => m.id).join('|');
  return useCallback((id: string) => modelColor(key.split('|').indexOf(id)), [key]);
}

export const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** 元素在视口内、且标签页可见（用于暂停计时器类的循环） */
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

/**
 * 打字机轮播：依次打出、停留、删除。返回当前文字和正在打的是第几句。
 * active=false 时停在第一句的完整文本；paused=true 时停在当前字，不空转计时器。
 */
export function useTypewriter(lines: string[], active: boolean, paused = false) {
  const [state, setState] = useState({ text: lines[0] ?? '', index: 0 });
  const st = useRef({ i: 0, n: 0, dir: 1 });
  const key = lines.join('\n');
  useEffect(() => {
    st.current = { i: 0, n: 0, dir: 1 };
    setState({ text: active && lines.length ? '' : lines[0] ?? '', index: 0 });
  }, [key, active]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!active || paused || !lines.length) return;
    let t = 0;
    const tick = () => {
      const s = st.current;
      const line = lines[s.i % lines.length];
      s.n = Math.max(0, Math.min(line.length, s.n + s.dir));
      setState({ text: line.slice(0, s.n), index: s.i % lines.length });
      let wait = s.dir > 0 ? 64 + Math.random() * 56 : 26;
      if (s.dir > 0 && s.n >= line.length) { s.dir = -1; wait = 2200; }
      else if (s.dir < 0 && s.n <= 0) { s.dir = 1; s.i = (s.i + 1) % lines.length; wait = 380; }
      t = window.setTimeout(tick, wait);
    };
    t = window.setTimeout(tick, 420);
    return () => clearTimeout(t);
  }, [key, active, paused]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}
