import { useRef, useState, type CSSProperties } from 'react';
import { useSite } from '../../../core/provider';
import { niceMax, scaleLinear } from '../../../core/charts/scale';
import { pct, wan, wanLabel } from '../../../core/data/format';
import { easeOut, seg, useModelColor, useScrollProgress } from '../lib';
import { Kicker, Legend, MaskText, Swap } from '../ui';

/** 三个阶段在 --vc-p 上的区间：目标长出 → 收入填充 → 回款叠加 */
const WIN: [number, number][] = [[0.03, 0.27], [0.36, 0.6], [0.69, 0.93]];

/**
 * 「目标 5,000 万」：sticky 段落。滚动时三根目标框长出，收入填进去，回款再叠一层；
 * 巨型数字跟着当前阶段从 0 计数。柱子的伸缩全部由 CSS 里的 --vc-p 计算，不逐帧重渲染。
 */
export function TargetStory() {
  const { derived, fx } = useSite();
  const color = useModelColor();
  const ref = useRef<HTMLElement>(null);
  const num = useRef<HTMLSpanElement>(null);
  const [phase, setPhase] = useState(fx.motion ? 0 : 2);
  const b = derived.business;
  const models = derived.models;
  const top = [...models].sort((a, z) => z.target - a.target)[0];
  const low = [...models].sort((a, z) => a.completion - z.completion)[0];

  const phases = [
    { label: '年度目标', value: b.target, text: <>{derived.meta.fiscalYear} 年 {models.length} 个型号的收入目标合计 <b>{wanLabel(b.target, 0)}</b>{top && <>，{top.id} 一家占 <b>{pct(top.target / (b.target || 1))}</b></>}。</> },
    { label: '已实现收入', value: b.revenue, text: <>已实现收入 <b>{wanLabel(b.revenue, 0)}</b>，完成目标的 <b className="is-accent">{pct(b.completion)}</b>，离目标还差 {wanLabel(b.gap, 0)}{low && <>；{low.id} 完成率最低，为 {pct(low.completion)}</>}。</> },
    { label: '已回款', value: b.received, text: <>已回款 <b>{wanLabel(b.received, 0)}</b>，占已实现收入的 <b className="is-accent">{pct(b.receivedRate)}</b>，还有 {wanLabel(b.revenue - b.received, 0)}没有回款。</> },
  ];

  useScrollProgress(ref, p => {
    if (!fx.motion) return; // 关闭特效：停在终态，巨型数字显示年度目标
    const ph = p < 0.32 ? 0 : p < 0.645 ? 1 : 2;
    setPhase(ph);
    const k = easeOut(seg(p, WIN[ph][0], WIN[ph][1]));
    if (num.current) num.current.textContent = wan(phases[ph].value * k, 0);
  }, { enabled: fx.motion });

  const max = niceMax(Math.max(1, ...models.map(m => m.target)), 4);
  const ticks = scaleLinear([0, max], [0, 1]).ticks(4);
  const w = (v: number) => `${(v / max) * 100}%`;
  const shown = fx.motion ? phases[phase] : phases[0];
  const [hi, setHi] = useState<string | null>(null);
  const hm = models.find(m => m.id === hi);

  return (
    <section id="vc-s-target" ref={ref} className="vc-track vc-target" style={{ '--vc-track': '290vh' } as CSSProperties} aria-labelledby="vc-target-title">
      <div className="vc-sticky vc-target-sticky">
        <div className="vc-target-copy">
          <Kicker>02 · 目标与完成</Kicker>
          <h2 id="vc-target-title" className="vc-h2"><MaskText lines={[`目标 ${wan(b.target, 0)} 万`]} /></h2>
          <div className="vc-giant" aria-live="off">
            <Swap key={fx.motion ? phase : 'static'} className="vc-giant-k">{shown.label}</Swap>
            <p className="vc-giant-v" aria-label={`${shown.label} ${wanLabel(shown.value, 0)}`}>
              <span ref={num} className="vc-giant-n" aria-hidden="true">{wan(shown.value, 0)}</span>
              <span className="vc-giant-u" aria-hidden="true">万元</span>
            </p>
          </div>
          {fx.motion ? (
            <p className="vc-body vc-target-text"><Swap key={phase}>{phases[phase].text}</Swap></p>
          ) : (
            <div className="vc-target-text is-all">{phases.map((p, i) => <p key={i} className="vc-body">{p.text}</p>)}</div>
          )}
        </div>

        <div className="vc-target-chart">
          <ol className="vc-steps" aria-label="阶段">
            {phases.map((p, i) => <li key={i} aria-current={phase === i ? 'step' : undefined}><span className="vc-mono">{i + 1}</span>{p.label}</li>)}
          </ol>
          <Legend items={[
            { label: '目标', color: 'var(--vc-ink-3)', kind: 'outline' },
            { label: '收入', color: 'var(--vc-ink)', kind: 'light' },
            { label: '回款', color: 'var(--vc-ink)', kind: 'solid' },
          ]} />
          <div className="vc-tg" role="group" aria-label={`各型号目标、收入与回款：${models.map(m => `${m.id} 目标 ${wan(m.target, 0)} 万元，收入 ${wan(m.revenue, 0)} 万元，回款 ${wan(m.received, 0)} 万元`).join('；')}`}
            onPointerLeave={e => { if (e.pointerType === 'mouse') setHi(null); }}>
            <div className="vc-tg-axis" aria-hidden="true"><span className="vc-rows-unit">万元</span><div>{ticks.map(t => <span key={t} style={{ left: w(t) }}>{wan(t, 0)}</span>)}</div></div>
            {models.map((m, i) => (
              <div key={m.id} className={`vc-tg-row ${hi && hi !== m.id ? 'is-dim' : ''}`} style={{ '--vc-row': i, '--c': color(m.id) } as CSSProperties} tabIndex={0}
                onPointerEnter={() => setHi(m.id)} onPointerDown={() => setHi(m.id)} onFocus={() => setHi(m.id)} onBlur={() => setHi(null)}>
                <div className="vc-tg-label"><b>{m.id}</b><span>{m.dept}</span></div>
                <div className="vc-tg-track">
                  {ticks.map(t => <i key={t} className="vc-row-grid" style={{ left: w(t) }} aria-hidden="true" />)}
                  <span className="vc-tg-bar is-target" style={{ width: w(m.target) }} />
                  <span className="vc-tg-bar is-rev" style={{ width: w(m.revenue) }} />
                  <span className="vc-tg-bar is-rec" style={{ width: w(m.received) }} />
                </div>
                <div className="vc-tg-val" aria-hidden="true">
                  <span className="is-0">{wan(m.target, 0)} 万</span>
                  <span className="is-1">{pct(m.completion)}</span>
                  <span className="is-2">{pct(m.receivedRate)}</span>
                </div>
              </div>
            ))}
            {hm && (
              <div className="vc-tip is-row" role="status" style={{ top: `calc(${models.indexOf(hm) + 1} * var(--vc-tg-h) + 30px)` }}>
                <p className="vc-tip-h">{hm.id} · {hm.dept}</p>
                <p className="vc-tip-row">目标<b>{wanLabel(hm.target, 0)}</b></p>
                <p className="vc-tip-row">收入<b>{wanLabel(hm.revenue, 0)} · {pct(hm.completion)}</b></p>
                <p className="vc-tip-row">回款<b>{wanLabel(hm.received, 0)} · {pct(hm.receivedRate)}</b></p>
              </div>
            )}
          </div>
          <p className="vc-caption vc-mono">右侧数字随阶段切换：目标金额 → 完成率 → 回款率</p>
        </div>
      </div>
    </section>
  );
}
