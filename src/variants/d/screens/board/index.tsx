import type { Route } from '../../../../core/route';
import { useSite } from '../../../../core/provider';
import { BOARD_LAYOUTS, isBoardId } from '../../model/boards';
import { IconArrowRight, IconAssets, IconBoard } from '../../ui/icons';
import { dHref } from '../../ui/lib';
import { Cockpit } from './Cockpit';
import './board.css';
import './edit.css';

/**
 * 看板页 #/d/board/<id>：已知 id 进驾驶舱（含编辑状态）；未知 id 显示「没有找到这个看板」，带返回资产列表的入口。
 * index.tsx（方案 D 入口）以默认导出引用：export default function BoardScreen({ route }: { route: Route })
 */
export default function BoardScreen({ route }: { route: Route }) {
  const id = route.assetId ?? '';
  if (!isBoardId(id)) return <BoardMissing id={id} />;
  return <Cockpit id={id} route={route} />;
}

function BoardMissing({ id }: { id: string }) {
  const { data } = useSite();
  const boards = Object.values(BOARD_LAYOUTS);
  return (
    <div className="vd-screen vd-bd-missing">
      <section className="vd-bd-miss" aria-labelledby="vd-bd-miss-title">
        <svg className="vd-bd-miss-fig" viewBox="0 0 220 120" aria-hidden="true">
          <defs>
            <radialGradient id="vd-miss-fade" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="currentColor" stopOpacity=".1" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse cx="110" cy="64" rx="104" ry="52" fill="url(#vd-miss-fade)" />
          <ellipse className="is-orbit" cx="110" cy="62" rx="92" ry="26" transform="rotate(-10 110 62)" />
          <ellipse className="is-orbit is-dash" cx="110" cy="62" rx="70" ry="40" transform="rotate(14 110 62)" />
          <circle className="is-globe" cx="110" cy="62" r="30" />
          {Array.from({ length: 34 }, (_, i) => {
            const a = i * 2.39996, r = 26 * Math.sqrt((i + 0.5) / 34);
            return <circle key={i} className="is-dot" cx={110 + r * Math.cos(a)} cy={62 + r * Math.sin(a)} r={1.1} />;
          })}
          <rect className="is-slot" x="182" y="22" width="22" height="22" rx="5" />
          <path className="is-q" d="M190 30.5a3.2 3.2 0 1 1 4.4 3c-.9.4-1.4 1-1.4 1.9v.6M193 39.4v.1" />
          <path className="is-cross" d="M18 92h10M23 87v10M196 98h8M200 94v8" />
        </svg>
        <p className="vd-kicker">404 · BOARD NOT FOUND</p>
        <h1 id="vd-bd-miss-title">没有找到这个看板</h1>
        <p className="vd-bd-miss-text">资产列表里没有「<span className="vd-mono">{id || '（空）'}</span>」这张看板。可能是链接写错了，或者它还没有建好。</p>
        <div className="vd-bd-miss-actions">
          <a className="vd-btn is-primary" href={dHref('assets')}><IconAssets />返回资产列表</a>
        </div>
        <div className="vd-bd-miss-list">
          <p className="vd-kicker">现有的看板 · {boards.length}</p>
          <ul>
            {boards.map(b => (
              <li key={b.id}>
                <a href={dHref('board', b.id)}>
                  <span className="vd-bd-miss-ic"><IconBoard /></span>
                  <span className="vd-bd-miss-name"><b>{data.assets.find(a => a.id === b.id)?.name ?? b.title}</b><small>{b.subtitle}</small></span>
                  <IconArrowRight className="vd-bd-miss-go" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
