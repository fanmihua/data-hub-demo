import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { MoonIcon, SlidersHorizontalIcon, SparkleIcon, SunIcon, XIcon } from '@phosphor-icons/react';
import { useSite } from '../../core/provider';
import type { Route } from '../../core/route';
import { AskBox } from './Ask';
import { OrbCss } from './Orb';
import { bHref, finePointer, isMac, scrollToEl } from './lib';

/* ───────── 导航 ───────── */

export function Nav({ route, onAsk }: { route: Route; onAsk: () => void }) {
  const { isDark, toggleMode, setPanelOpen, data, fx } = useSite();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  const home = route.page === 'home';
  const go = (section: string) => (e: MouseEvent) => {
    if (!home) return;
    e.preventDefault();
    scrollToEl(document.getElementById(`vb-sec-${section}`), fx.motion);
  };
  const links = [
    { id: 'insights', label: '洞察' },
    { id: 'particles', label: '型号收入' },
    { id: 'domains', label: '看板与业务域' },
  ];
  return (
    <header className={`vb-nav${scrolled ? ' is-scrolled' : ''}`}>
      <a className="vb-skip" href="#vb-main" onClick={e => { e.preventDefault(); document.getElementById('vb-main')?.focus(); scrollToEl(document.getElementById('vb-main'), false, 0); }}>跳到正文</a>
      <a className="vb-brand" href={bHref(route)} onClick={e => { if (home) { e.preventDefault(); window.scrollTo({ top: 0, behavior: fx.motion ? 'smooth' : 'auto' }); } }}>
        <span className="vb-brand-mark" aria-hidden="true" />
        <span className="vb-brand-name">{data.meta.title}</span>
      </a>
      <nav className="vb-nav-links" aria-label="主导航">
        {home
          ? links.map(l => <a key={l.id} href={bHref(route, 'home', null, { section: l.id })} onClick={go(l.id)}>{l.label}</a>)
          : data.assets.map(a => <a key={a.id} href={bHref(route, 'board', a.id)} aria-current={route.assetId === a.id ? 'page' : undefined}>{a.name}</a>)}
      </nav>
      <div className="vb-nav-actions">
        <button type="button" className="vb-askpill" onClick={onAsk} aria-label="问数据（快捷键 ⌘K 或 Ctrl K）">
          <SparkleIcon size={15} weight="fill" aria-hidden="true" />
          <span className="vb-askpill-t">问数据</span>
          <kbd aria-hidden="true">{isMac() ? '⌘' : 'Ctrl'} K</kbd>
        </button>
        <button type="button" className="vb-icon-btn" onClick={e => toggleMode({ x: e.clientX, y: e.clientY })} aria-label={isDark ? '切换到浅色' : '切换到深色'} title={isDark ? '浅色' : '深色'}>
          {isDark ? <SunIcon size={18} aria-hidden="true" /> : <MoonIcon size={18} aria-hidden="true" />}
        </button>
        <button type="button" className="vb-icon-btn" onClick={() => setPanelOpen(true)} aria-label="风格与数据" title="风格与数据">
          <SlidersHorizontalIcon size={18} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

/* ───────── 指针光斑 ───────── */

/**
 * 背景上一层很淡的光斑跟着指针走：只改 transform（合成层），用 CSS transition 做跟随的缓动，
 * 不跑常驻 rAF。浅色几乎看不出，深色更明显；轻量特效时减半，关闭特效时不显示。
 */
export function PointerGlow() {
  const { fx } = useSite();
  const blob = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = blob.current;
    if (!el || !fx.motion || !finePointer()) return;
    let raf = 0, x = 0, y = 0;
    const paint = () => { raf = 0; el.style.transform = `translate3d(${x}px, ${y}px, 0)`; el.classList.add('is-on'); };
    const move = (e: PointerEvent) => { x = e.clientX; y = e.clientY; if (!raf) raf = requestAnimationFrame(paint); };
    const leave = () => el.classList.remove('is-on');
    window.addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', leave);
    return () => { window.removeEventListener('pointermove', move); document.documentElement.removeEventListener('pointerleave', leave); cancelAnimationFrame(raf); };
  }, [fx.motion]);
  return (
    <div className="vb-glow-layer" aria-hidden="true">
      <div ref={blob} className="vb-glow-blob" />
    </div>
  );
}

/* ───────── ⌘K 问数据弹窗（看板页） ───────── */

export function AskDialog({ route, onClose }: { route: Route; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && panel.current) {
        const f = [...panel.current.querySelectorAll<HTMLElement>('button, a[href], input')];
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    // 回答里的看板链接会改变路由，路由变化时关闭
    const onHash = () => onClose();
    window.addEventListener('hashchange', onHash);
    return () => { document.removeEventListener('keydown', onKey); window.removeEventListener('hashchange', onHash); prev?.focus?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="vb-dialog-layer">
      <button type="button" className="vb-drawer-scrim" aria-label="关闭问数据" onClick={onClose} tabIndex={-1} />
      <div ref={panel} className="vb-dialog" role="dialog" aria-modal="true" aria-labelledby="vb-dialog-t">
        <header className="vb-dialog-head">
          <OrbCss small />
          <h2 id="vb-dialog-t">问数据</h2>
          <button type="button" className="vb-icon-btn" onClick={onClose} aria-label="关闭"><XIcon size={18} /></button>
        </header>
        <AskBox route={route} compact autoFocus />
        <p className="vb-ask-hint">按关键词匹配本地演示数据，回答不是 AI 生成。</p>
      </div>
    </div>
  );
}

