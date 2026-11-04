import { useRef, type CSSProperties } from 'react';
import { useSite } from '../../../core/provider';
import type { FlowLink, FlowNode } from '../../../core/data/derive';
import { pct, wanLabel } from '../../../core/data/format';
import { useModelColor, useScrollProgress, useSize } from '../lib';
import { Sankey, type Timing } from '../charts';
import { Kicker, Legend, MaskText } from '../ui';

/** 描线时间表（--vc-p 上）：型号节点 → 第一段连线 → 分系统节点 → 第二段连线 → 状态节点 */
const T = { n0: [0.0, 0.08], l0: [0.08, 0.4], n1: [0.36, 0.1], l1: [0.5, 0.36], n2: [0.82, 0.1] } as const;
const NOTE_AT = [0.04, 0.42, 0.8];

/**
 * 「钱流到了哪里」：sticky 桑基图（型号 → 分系统 → 已付 / 待付）。
 * 连线用 pathLength=1 + stroke-dashoffset，由 --vc-p 逐段描出；每段配一句旁注，到点时点亮。
 */
export function FlowStory() {
  const { derived, fx } = useSite();
  const color = useModelColor();
  const ref = useRef<HTMLElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const { width, height } = useSize(box);
  useScrollProgress(ref, undefined, { enabled: fx.motion });

  const s = derived.spend;
  const topModel = derived.byModel[0];
  const topSys = derived.bySystem[0];
  const lowSys = derived.bySystem[derived.bySystem.length - 1];
  const compact = width < 640;
  // sticky 时跟随可用高度；关闭特效按长文排版时用固定高度
  const sankeyH = fx.motion ? Math.max(260, Math.min(compact ? 380 : 540, height || 420)) : compact ? 360 : 480;

  const l0 = derived.flow.links.filter(l => l.source.startsWith('m:'));
  const l1 = derived.flow.links.filter(l => l.source.startsWith('s:'));
  const timing = {
    node: (n: FlowNode): Timing => (n.column === 0 ? [T.n0[0], T.n0[1]] : n.column === 1 ? [T.n1[0], T.n1[1]] : [T.n2[0], T.n2[1]]),
    link: (l: FlowLink): Timing => {
      const group = l.source.startsWith('m:') ? l0 : l1;
      const [st, du] = l.source.startsWith('m:') ? T.l0 : T.l1;
      const i = group.findIndex(x => x.source === l.source && x.target === l.target);
      const each = du * 0.55;
      return [st + ((du - each) * i) / Math.max(1, group.length - 1), each];
    },
  };

  const notes = [
    <>报账合计 <b>{wanLabel(s.billed, 0)}</b>，来自 {derived.byModel.length} 个型号；{topModel && <>{topModel.key} 最多，占 <b>{pct(topModel.billed / (s.billed || 1))}</b>。</>}</>,
    <>{topSys && <>花在 <b>{topSys.key}</b> 的最多，{wanLabel(topSys.billed, 0)}；</>}{lowSys && lowSys !== topSys && <>{lowSys.key} 最少，{wanLabel(lowSys.billed, 0)}。</>}</>,
    <>已付 <b>{wanLabel(s.paid, 0)}</b>，占 <b className="is-accent">{pct(s.payRate)}</b>；还有 <b>{wanLabel(s.unpaid, 0)}</b>待付（斜纹）。</>,
  ];

  return (
    <section id="vc-s-flow" ref={ref} className="vc-track vc-flow" style={{ '--vc-track': '330vh' } as CSSProperties} aria-labelledby="vc-flow-title">
      <div className="vc-sticky vc-flow-sticky">
        <header className="vc-flow-head">
          <div>
            <Kicker>03 · 资金流向</Kicker>
            <h2 id="vc-flow-title" className="vc-h2"><MaskText lines={['钱流到了哪里']} /></h2>
          </div>
          <Legend items={[
            ...derived.byModel.map(m => ({ label: m.key, color: color(m.key), kind: 'solid' as const })),
            { label: '已付', color: 'var(--vc-ink-3)', kind: 'solid' as const },
            { label: '待付', color: 'var(--accent)', kind: 'hatch' as const },
          ]} />
        </header>
        <div className="vc-flow-cols vc-mono" aria-hidden="true"><span>型号</span><span>分系统</span><span>付款状态</span></div>
        <div className="vc-flow-box" ref={box}>
          <Sankey
            nodes={derived.flow.nodes} links={derived.flow.links} height={sankeyH} compact={compact}
            ariaLabel={`资金流向：报账合计 ${wanLabel(s.billed, 0)}，已付 ${wanLabel(s.paid, 0)}，待付 ${wanLabel(s.unpaid, 0)}。`}
            linkPaint={(l, src) => (src.kind === 'model' ? color(src.label) : l.target === 'st:unpaid' ? 'hatch' : 'var(--vc-ink-3)')}
            nodePaint={n => (n.kind === 'model' ? color(n.label) : n.id === 'st:unpaid' ? 'var(--accent)' : n.id === 'st:paid' ? 'var(--vc-ink-2)' : 'var(--vc-ink)')}
            timing={fx.motion ? timing : undefined}
          />
        </div>
        <ol className="vc-flow-notes">
          {notes.map((n, i) => (
            <li key={i} style={{ '--vc-s': NOTE_AT[i] } as CSSProperties}>
              <span className="vc-note-no" aria-hidden="true">{i + 1}</span>
              <p>{n}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
