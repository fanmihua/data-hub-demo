import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { useSite } from '../../../core/provider';
import { navigate, type Route } from '../../../core/route';
import { useSpotlight } from '../../../core/fx/hooks';
import { isBoardId } from '../model/boards';
import { dHref, VD_FOCUS_SEARCH } from '../ui/lib';
import { Rail } from './Rail';
import { TopBar } from './TopBar';

/**
 * 应用外壳：左栏 + 顶栏 + 工作区。
 * - 一屏布局：视口宽 ≥ 1024 时高度固定 100dvh，页面本身不滚动，内容只在面板内部滚动；更窄时整页纵向滚动。
 *   工作区底部留出 --vd-dock-safe，避开底部方案切换条。
 * - 页面切换（page 或看板 id 变化）用 View Transitions：工作区交叉淡入 + 轻微位移，左栏指示条滑到新位置；
 *   不支持 View Transitions 或关闭特效时直接切换。
 * - ⌘K / Ctrl K：跳到资产页并聚焦搜索框（已在资产页时派发 VD_FOCUS_SEARCH 事件）。
 * - 嵌套：index.tsx 在最外层套一个 Shell；界面里如果再套 <Shell crumbs actions>，
 *   内层只把面包屑和顶栏按钮交给外层，不会重复渲染外壳。
 */

interface Chrome { crumbs: string[]; actions?: ReactNode }
const ShellCtx = createContext<((c: Chrome | null) => void) | null>(null);

let lastBoard = 'operations';
let vtRunning = 0;

type VT = { finished: Promise<void>; ready: Promise<void>; updateCallbackDone: Promise<void> };
type DocVT = Document & { startViewTransition?: (cb: () => void) => VT };

export function Shell({ route, crumbs, actions, children }: { route: Route; crumbs: string[]; actions?: ReactNode; children: ReactNode }) {
  const outer = useContext(ShellCtx);
  if (outer) return <NestedShell report={outer} crumbs={crumbs} actions={actions}>{children}</NestedShell>;
  return <RootShell route={route} crumbs={crumbs} actions={actions}>{children}</RootShell>;
}

function NestedShell({ report, crumbs, actions, children }: { report: (c: Chrome | null) => void; crumbs: string[]; actions?: ReactNode; children: ReactNode }) {
  const key = crumbs.join('\u0000');
  useLayoutEffect(() => { report({ crumbs, actions }); }, [key, actions]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => () => report(null), [report]);
  return <>{children}</>;
}

function RootShell({ route, crumbs, actions, children }: { route: Route; crumbs: string[]; actions?: ReactNode; children: ReactNode }) {
  const { fx } = useSite();
  const app = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLElement>(null);
  const [override, setOverride] = useState<Chrome | null>(null);
  const report = useCallback((c: Chrome | null) => setOverride(c), []);
  useSpotlight(app, fx.motion);

  if (route.page === 'board' && route.assetId && isBoardId(route.assetId)) lastBoard = route.assetId;

  /* View Transitions：新路由先不渲染，等 startViewTransition 拍下旧画面后，在回调里同步换成新界面 */
  const key = `${route.page}|${route.assetId ?? ''}`;
  const canVT = fx.motion && typeof document !== 'undefined' && typeof (document as DocVT).startViewTransition === 'function';
  const [frame, setFrame] = useState(() => ({ key, route, children, crumbs }));
  const pending = canVT && key !== frame.key;
  useLayoutEffect(() => {
    if (key === frame.key) return;
    const next = { key, route, children, crumbs };
    const doc = document as DocVT;
    // 标签页在后台时浏览器没有渲染时机，View Transitions 的回调会一直等着，所以直接切换
    if (!canVT || !doc.startViewTransition || document.hidden) { setFrame(next); return; }
    const root = document.documentElement;
    let applied = false;
    const apply = () => { if (applied) return; applied = true; flushSync(() => setFrame(next)); };
    vtRunning += 1;
    root.setAttribute('data-vd-vt', '');
    const t = doc.startViewTransition(apply);
    // 兜底：回调 400ms 内没被调用（例如被别的过渡打断），直接换上新界面
    const timer = window.setTimeout(apply, 400);
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      apply();
      vtRunning = Math.max(0, vtRunning - 1);
      if (!vtRunning) root.removeAttribute('data-vd-vt');
    };
    // 被跳过（连续切换、标签页隐藏）时这几个 promise 会 reject，都接住，避免控制台报错
    t.ready.catch(() => {});
    t.updateCallbackDone.catch(() => {});
    t.finished.catch(() => {}).finally(end);
    // 过渡最长 0.5 秒；1.5 秒还没结束（渲染被暂停等）也撤掉标记，免得 view-transition-name 一直挂着
    window.setTimeout(end, 1500);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const shownRoute = pending ? frame.route : route;
  const shownChildren = pending ? frame.children : children;
  const shownCrumbs = override?.crumbs ?? (pending ? frame.crumbs : crumbs);
  const shownActions = override ? override.actions : actions;

  const goSearch = useCallback(() => {
    window.dispatchEvent(new Event(VD_FOCUS_SEARCH));
    navigate(dHref('assets', null, { focus: 'search' }));
  }, []);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') { e.preventDefault(); goSearch(); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [goSearch]);

  return (
    <ShellCtx.Provider value={report}>
      <div ref={app} className={`vd-app is-${shownRoute.page}`}>
        <button type="button" className="vd-skip" onClick={() => main.current?.focus()}>跳到主要内容</button>
        <Rail route={shownRoute} boardId={lastBoard} />
        <div className="vd-main">
          <TopBar crumbs={shownCrumbs} actions={shownActions} onSearch={goSearch} />
          <main ref={main} className="vd-work" tabIndex={-1} aria-label={shownCrumbs[shownCrumbs.length - 1]}>
            <div className="vd-work-bg" aria-hidden="true"><i className="vd-work-grid" /><i className="vd-work-light" /></div>
            <div className="vd-stage">{shownChildren}</div>
          </main>
        </div>
      </div>
    </ShellCtx.Provider>
  );
}
