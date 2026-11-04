import { useCallback, useState } from 'react';
import type { Route } from '../../core/route';
import type { BillRow } from '../../core/data/derive';
import { Footer, Nav } from './chrome';
import { Board } from './Board';
import { ChainDrawer } from './drawer';
import { Hero } from './home/Hero';
import { TargetStory } from './home/TargetStory';
import { FlowStory } from './home/FlowStory';
import { BillTimeline } from './home/BillTimeline';
import { LitText } from './home/LitText';
import { Boards, Domains } from './home/Lists';
import './c.css';

/**
 * 方案 C · 轨道叙事（Orbital Story）
 * 首页是一篇滚动的数据报道：经费在轨 → 目标 → 流向 → 报账单 → 小结 → 业务域 → 看板。
 * 看板页回到分析模式，保留编辑式注释（结论句、编号旁注、小多图）。
 */
function Home() {
  const [bill, setBill] = useState<BillRow | null>(null);
  const close = useCallback(() => setBill(null), []);
  return (
    <>
      <Nav mode="home" />
      <main id="vc-main" tabIndex={-1} className="vc-main vc-home">
        <Hero />
        <TargetStory />
        <FlowStory />
        <BillTimeline onOpen={setBill} />
        <LitText />
        <Domains />
        <Boards />
      </main>
      <Footer />
      <ChainDrawer bill={bill} onClose={close} />
    </>
  );
}

export default function Variant({ route }: { route: Route }) {
  return (
    <div className="vc-root">
      {route.page === 'board' ? <Board assetId={route.assetId} /> : <Home />}
    </div>
  );
}
