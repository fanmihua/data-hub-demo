import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { useSite } from '../../core/provider';
import type { Route } from '../../core/route';
import { Nav } from './shell/Nav';
import { Footer } from './shell/Footer';
import { Home } from './home/Home';
import { Board } from './board/Board';
import { link, useFramesStalled } from './lib';
import './styles/base.css';
import './styles/home.css';
import './styles/charts.css';
import './styles/board.css';

function NotFound({ id }: { id: string }) {
  const { data } = useSite();
  return (
    <section className="va-notfound va-wrap" aria-labelledby="va-nf-title">
      <div className="va-nf-grid" aria-hidden="true" />
      <div className="va-nf-card va-cross">
        <p className="va-mono">NO SIGNAL · ASSET “{id}”</p>
        <h1 id="va-nf-title">没有找到这个看板</h1>
        <p>资产清单里没有「{id}」。可能是链接写错了，或者这块看板还没有开放。</p>
        <div className="va-nf-actions">
          <a className="va-btn va-btn-primary" href={link('home')}><ArrowLeft size={16} aria-hidden="true" />返回首页</a>
        </div>
        <ul className="va-nf-list" aria-label="现有看板">
          {data.assets.map(a => (
            <li key={a.id}><a href={link('board', a.id)}><span className="va-mono">{a.code}</span>{a.name}<ArrowUpRight size={14} aria-hidden="true" /></a></li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** 主题色上的文字颜色：按 WCAG 对比度在墨色和白色之间选更清楚的一个 */
function onAccent(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  const L = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  return L > 0.179 ? '#0B0D12' : '#FFFFFF';
}

/** 方案 A · 白昼测控：首页 + 看板 + 未找到 */
export default function Variant({ route }: { route: Route }) {
  const { data, accent } = useSite();
  const stalled = useFramesStalled();
  const asset = route.page === 'board' ? data.assets.find(a => a.id === route.assetId) ?? null : null;
  return (
    <div className={`va-root${stalled ? ' is-static' : ''}`} style={{ ['--va-on-accent' as string]: /^#[0-9a-f]{6}$/i.test(accent.hex) ? onAccent(accent.hex) : 'var(--accent-contrast)' }}>
      <Nav route={route} />
      <main id="va-main" tabIndex={-1} className={`va-main${route.page === 'board' ? ' is-board' : ''}`}>
        {route.page === 'home' && <Home route={route} />}
        {route.page === 'board' && asset && <Board key={asset.id} route={route} asset={asset} />}
        {route.page === 'board' && !asset && <NotFound id={route.assetId ?? ''} />}
      </main>
      <Footer />
    </div>
  );
}
