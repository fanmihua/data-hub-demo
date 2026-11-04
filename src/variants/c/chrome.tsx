import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { ArrowLeft, Moon, SlidersHorizontal, Sun } from 'lucide-react';
import { useSite } from '../../core/provider';
import { href } from '../../core/route';
import { dateTimeLabel } from '../../core/data/format';
import { scrollToEl } from './lib';

export const CHAPTERS = [
  { id: 'vc-s-hero', label: '经费在轨' },
  { id: 'vc-s-target', label: '目标' },
  { id: 'vc-s-flow', label: '流向' },
  { id: 'vc-s-bills', label: '报账单' },
  { id: 'vc-s-summary', label: '小结' },
  { id: 'vc-s-domains', label: '业务域' },
  { id: 'vc-s-boards', label: '看板' },
];

function Mark() {
  // 标志：一个被椭圆轨道环绕的点
  return (
    <svg className="vc-mark" viewBox="0 0 28 28" width="26" height="26" aria-hidden="true">
      <ellipse cx="14" cy="14" rx="12" ry="5" transform="rotate(-24 14 14)" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="14" cy="14" r="3.2" fill="currentColor" />
      <circle cx="24.2" cy="9.6" r="2.2" fill="var(--accent)" />
    </svg>
  );
}

function Tools() {
  const { isDark, toggleMode, setPanelOpen } = useSite();
  const onTheme = (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const keyboard = e.clientX === 0 && e.clientY === 0;
    toggleMode({ x: keyboard ? r.left + r.width / 2 : e.clientX, y: keyboard ? r.top + r.height / 2 : e.clientY });
  };
  return (
    <div className="vc-nav-tools">
      <button type="button" className="vc-icon-btn" onClick={onTheme} aria-label={isDark ? '切换到浅色' : '切换到深色'} title={isDark ? '浅色' : '深色'}>
        {isDark ? <Sun size={18} strokeWidth={1.6} aria-hidden="true" /> : <Moon size={18} strokeWidth={1.6} aria-hidden="true" />}
      </button>
      <button type="button" className="vc-icon-btn is-label" onClick={() => setPanelOpen(true)}>
        <SlidersHorizontal size={16} strokeWidth={1.6} aria-hidden="true" /><span>风格与数据</span>
      </button>
    </div>
  );
}

/** 顶部导航：首页显示章节目录和阅读进度，看板页显示返回与看板切换 */
export function Nav({ mode, assetId }: { mode: 'home' | 'board'; assetId?: string | null }) {
  const { data, fx } = useSite();
  const bar = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(CHAPTERS[0].id);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let raf = 0;
    const paint = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? window.scrollY / max : 0;
      bar.current?.style.setProperty('transform', `scaleX(${p.toFixed(4)})`);
      setScrolled(window.scrollY > 8);
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(paint); };
    paint();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', on); window.removeEventListener('resize', on); };
  }, []);

  useEffect(() => {
    if (mode !== 'home' || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) setActive(e.target.id); });
    }, { rootMargin: '-48% 0px -50% 0px' });
    CHAPTERS.forEach(c => { const el = document.getElementById(c.id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [mode]);

  return (
    <header className={`vc-nav ${scrolled ? 'is-scrolled' : ''}`}>
      <a className="vc-skip" href="#vc-main" onClick={e => { e.preventDefault(); document.getElementById('vc-main')?.focus(); }}>跳到正文</a>
      <div className="vc-nav-in">
        <a className="vc-brand" href={href('c')} aria-label="Data Hub 首页">
          <Mark /><b>Data Hub</b><span className="vc-brand-sub">轨道叙事</span>
        </a>
        {mode === 'home' ? (
          <nav className="vc-nav-chapters" aria-label="章节">
            {CHAPTERS.map((c, i) => (
              <button key={c.id} type="button" aria-current={active === c.id ? 'true' : undefined} onClick={() => scrollToEl(document.getElementById(c.id), fx.motion, 0)}>
                <span className="vc-mono">{String(i + 1).padStart(2, '0')}</span>{c.label}
              </button>
            ))}
          </nav>
        ) : (
          <nav className="vc-nav-chapters is-board" aria-label="看板">
            <a href={href('c')} className="vc-nav-back"><ArrowLeft size={15} aria-hidden="true" />首页</a>
            {data.assets.map(a => (
              <a key={a.id} href={href('c', 'board', a.id)} aria-current={assetId === a.id ? 'page' : undefined}>{a.name}</a>
            ))}
          </nav>
        )}
        <p className="vc-nav-asof"><span className="vc-dot" aria-hidden="true" />演示数据 · 截至 {dateTimeLabel(data.meta.asOf)}</p>
        <Tools />
      </div>
      <div className="vc-nav-progress" aria-hidden="true"><div ref={bar} /></div>
    </header>
  );
}

export function Footer() {
  const { data } = useSite();
  return (
    <footer className="vc-footer">
      <div className="vc-footer-in">
        <p className="vc-footer-big">Data Hub</p>
        <div className="vc-footer-meta">
          <p>{data.meta.org} · {data.meta.fiscalYear} 年度</p>
          <p>演示数据：{data.meta.note}</p>
          <p>数据截至 {dateTimeLabel(data.meta.asOf)} · 页面不连接真实业务系统</p>
        </div>
        <p className="vc-footer-sign vc-mono">ORBITAL STORY · 方案 C</p>
      </div>
    </footer>
  );
}
