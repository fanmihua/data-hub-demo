import { useEffect, useState, type MouseEvent } from 'react';
import { Menu, Moon, Search, SlidersHorizontal, Sun, X } from 'lucide-react';
import { useSite } from '../../../core/provider';
import type { Route } from '../../../core/route';
import { link, scrollToSection } from '../lib';
import { SearchDialog } from './Search';

export function Logo() {
  return (
    <svg className="va-logo-mark" viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
      <rect x=".5" y=".5" width="27" height="27" rx="7" className="va-logo-tile" />
      <circle cx="14" cy="14" r="5.2" className="va-logo-core" />
      <ellipse cx="14" cy="14" rx="10" ry="4" transform="rotate(-24 14 14)" className="va-logo-orbit" />
      <circle cx="22.6" cy="9.6" r="1.7" className="va-logo-sat" />
    </svg>
  );
}

const LINKS = [
  { id: 'top', label: '首页' },
  { id: 'overview', label: '看板' },
  { id: 'domains', label: '业务域' },
  { id: 'assets', label: '资产' },
];

/** 导航：首屏透明，滚动后变成玻璃并出现底线。右侧：检索、明暗（圆形扩散）、风格与数据面板。 */
export function Nav({ route }: { route: Route }) {
  const { isDark, toggleMode, setPanelOpen, fx } = useSite();
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState('top');

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  // 首页滚动定位当前段落
  useEffect(() => {
    if (route.page !== 'home') { setActive('overview'); return; }
    setActive('top');
    const ids = ['overview', 'domains', 'assets'];
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => seen.set(e.target.id.replace('va-', ''), e.isIntersecting));
      const hit = ids.filter(id => seen.get(id)).pop();
      setActive(hit ?? 'top');
    }, { rootMargin: '-45% 0px -50% 0px' });
    const t = setTimeout(() => ids.forEach(id => { const el = document.getElementById(`va-${id}`); if (el) io.observe(el); }), 50);
    return () => { clearTimeout(t); io.disconnect(); };
  }, [route.page]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(o => !o); }
      else if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  useEffect(() => { setMenuOpen(false); }, [route.page, route.assetId]);

  const go = (id: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    setMenuOpen(false);
    if (route.page !== 'home') return;
    e.preventDefault();
    if (id === 'top') window.scrollTo({ top: 0, behavior: fx.motion ? 'smooth' : 'auto' });
    else scrollToSection(id, fx.motion);
  };
  const toTheme = (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX || r.left + r.width / 2, y = e.clientY || r.top + r.height / 2;
    toggleMode({ x, y });
  };

  return (
    <>
      <a className="va-skip" href="#va-main" onClick={e => { e.preventDefault(); document.getElementById('va-main')?.focus(); }}>跳到正文</a>
      <header className={`va-nav${scrolled || route.page !== 'home' ? ' is-scrolled' : ''}${menuOpen ? ' is-menu' : ''}`}>
        <div className="va-nav-inner">
          <a className="va-brand" href={link('home')} onClick={go('top')} aria-label="Data Hub 首页">
            <Logo />
            <span>Data Hub</span>
          </a>
          <nav className="va-nav-links" aria-label="主导航">
            {LINKS.map(l => (
              <a key={l.id} href={l.id === 'top' ? link('home') : link('home', null, { section: l.id })} onClick={go(l.id)}
                aria-current={active === l.id ? (route.page === 'home' ? 'location' : 'page') : undefined}>
                {l.label}
              </a>
            ))}
          </nav>
          <div className="va-nav-tools">
            <button type="button" className="va-nav-search" onClick={() => setSearchOpen(true)} aria-label="检索（⌘K）">
              <Search size={16} aria-hidden="true" />
              <span>检索</span>
              <kbd className="va-mono">⌘K</kbd>
            </button>
            <button type="button" className="va-icon-btn" onClick={toTheme} aria-label={isDark ? '切换到浅色' : '切换到深色'} title={isDark ? '切换到浅色' : '切换到深色'}>
              {isDark ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
            </button>
            <button type="button" className="va-icon-btn" onClick={() => setPanelOpen(true)} aria-label="风格与数据" title="风格与数据">
              <SlidersHorizontal size={17} aria-hidden="true" />
            </button>
            <button type="button" className="va-icon-btn va-nav-menu" onClick={() => setMenuOpen(o => !o)} aria-expanded={menuOpen} aria-controls="va-menu" aria-label={menuOpen ? '收起菜单' : '展开菜单'}>
              {menuOpen ? <X size={17} aria-hidden="true" /> : <Menu size={17} aria-hidden="true" />}
            </button>
          </div>
        </div>
        <nav id="va-menu" className="va-menu" aria-label="移动端导航" hidden={!menuOpen}>
          {LINKS.map(l => (
            <a key={l.id} href={l.id === 'top' ? link('home') : link('home', null, { section: l.id })} onClick={go(l.id)}>
              <span className="va-mono">{l.id === 'top' ? 'HOME' : l.id.toUpperCase()}</span>{l.label}
            </a>
          ))}
        </nav>
      </header>
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
