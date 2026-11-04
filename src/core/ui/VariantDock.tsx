import { useState } from 'react';
import { VARIANTS } from '../config/config';
import { useSite } from '../provider';
import { href, type Route } from '../route';

/** 底部居中的方案切换条：A / B / C + 风格与数据。可收起。 */
export function VariantDock({ route }: { route: Route }) {
  const { setPanelOpen } = useSite();
  const [min, setMin] = useState(() => { try { return localStorage.getItem('datahub:dock-min') === '1'; } catch { return false; } });
  const toggleMin = () => { setMin(v => { try { localStorage.setItem('datahub:dock-min', v ? '0' : '1'); } catch { /* ignore */ } return !v; }); };

  if (min) {
    return (
      <nav className="dh-dock is-min" aria-label="方案切换">
        <button className="dh-dock-min" onClick={toggleMin} aria-label="展开方案切换条" title="展开方案切换条">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
      </nav>
    );
  }
  return (
    <nav className="dh-dock" aria-label="方案切换">
      <span className="dh-dock-label">设计方案</span>
      {VARIANTS.map(v => (
        <a key={v.id} href={href(v.id, route.page, route.assetId)} aria-current={route.variant === v.id ? 'page' : undefined} title={v.tagline}>
          <b>{v.short}</b><span>{v.name}</span>
        </a>
      ))}
      <span className="dh-dock-sep" aria-hidden="true" />
      <button onClick={() => setPanelOpen(true)}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="16" cy="7" r="2" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="10" cy="17" r="2" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
        <span>风格与数据</span>
      </button>
      <button className="dh-dock-min" onClick={toggleMin} aria-label="收起方案切换条" title="收起">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" /></svg>
      </button>
    </nav>
  );
}
