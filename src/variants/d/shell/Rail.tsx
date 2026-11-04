import type { MouseEvent } from 'react';
import { useSite } from '../../../core/provider';
import type { Route } from '../../../core/route';
import { IconAssets, IconBoard, IconChat, IconMoon, IconSettings, IconSun, IconWelcome, LogoMark } from '../ui/icons';
import { dHref } from '../ui/lib';

/**
 * 左侧细栏：标志 + 图标导航（欢迎、问答、资产、看板）+ 底部明暗切换与「风格与数据」。
 * 当前项：主色图标、浅主色底、左缘一道带微光的主色指示条（页面切换时指示条在 View Transitions 里滑过去）。
 */
export function Rail({ route, boardId }: { route: Route; boardId: string }) {
  const { isDark, toggleMode, setPanelOpen } = useSite();
  const items = [
    { page: 'home' as const, label: '欢迎', to: dHref('home'), Icon: IconWelcome },
    { page: 'chat' as const, label: '问答', to: dHref('chat'), Icon: IconChat },
    { page: 'assets' as const, label: '资产', to: dHref('assets'), Icon: IconAssets },
    { page: 'board' as const, label: '看板', to: dHref('board', boardId), Icon: IconBoard },
  ];
  const onMode = (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    toggleMode({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  };
  return (
    <nav className="vd-rail" aria-label="主导航">
      <a className="vd-rail-logo" href={dHref('home')} aria-label="Data Hub 数据舱 · 回到欢迎页">
        <LogoMark size={34} />
      </a>
      <ul className="vd-rail-nav">
        {items.map(({ page, label, to, Icon }) => {
          const on = route.page === page;
          return (
            <li key={page}>
              <a className={`vd-rail-item${on ? ' is-on' : ''}`} href={to} aria-current={on ? 'page' : undefined}>
                {on && <span className="vd-rail-ind" aria-hidden="true" />}
                <span className="vd-rail-ic"><Icon size={20} /></span>
                <span className="vd-rail-label">{label}</span>
              </a>
            </li>
          );
        })}
      </ul>
      <div className="vd-rail-foot">
        <button type="button" className="vd-rail-btn" onClick={onMode} aria-label={isDark ? '切换到浅色' : '切换到深色'} data-tip={isDark ? '浅色' : '深色'}>
          {isDark ? <IconSun size={20} /> : <IconMoon size={20} />}
        </button>
        <button type="button" className="vd-rail-btn" onClick={() => setPanelOpen(true)} aria-label="风格与数据" data-tip="风格与数据">
          <IconSettings size={20} />
        </button>
      </div>
    </nav>
  );
}
