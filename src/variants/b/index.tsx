import { useCallback, useEffect, useRef, useState } from 'react';
import type { Route } from '../../core/route';
import { useSite } from '../../core/provider';
import type { AskHandle } from './Ask';
import { Board } from './Board';
import { Home } from './Home';
import { AskDialog, Nav, PointerGlow } from './Shell';
import './b.css';
import './charts.css';
import './home.css';
import './board.css';

/**
 * 方案 B · 极光智能（Aurora Intelligence）
 * 首页：呼吸光球 + 问答式检索 → 关键指标 → 洞察流 → 粒子成图 → 看板与业务域。
 * 看板：本页要点 + 筛选 + 指标 + 主图 / 辅图 + 明细表 + 付款链路抽屉。
 */
export default function Variant({ route }: { route: Route }) {
  const { fx } = useSite();
  const askRef = useRef<AskHandle>(null);
  const [dialog, setDialog] = useState(false);

  const openAsk = useCallback(() => {
    if (route.page === 'home' && askRef.current) {
      window.scrollTo({ top: 0, behavior: fx.motion ? 'smooth' : 'auto' });
      askRef.current.focus();
    } else setDialog(true);
  }, [route.page, fx.motion]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openAsk(); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [openAsk]);
  useEffect(() => { setDialog(false); }, [route.page, route.assetId]);

  return (
    <div className="vb-root">
      <PointerGlow />
      <Nav route={route} onAsk={openAsk} />
      {route.page === 'board' && route.assetId ? <Board route={route} assetId={route.assetId} /> : <Home route={route} askRef={askRef} />}
      {dialog && <AskDialog route={route} onClose={() => setDialog(false)} />}
    </div>
  );
}
