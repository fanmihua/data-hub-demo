import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useSite } from '../../../../core/provider';
import { int, pctNumber, wan } from '../../../../core/data/format';
import type { AnswerBar, AnswerChart, AnswerFigure, DAnswer } from '../../model/answers';
import { BOARD_LAYOUTS } from '../../model/boards';
import { BigNumber } from '../../ui/BigNumber';
import { Chip } from '../../ui/Chip';
import { IconArrowUpRight, IconAssets, IconCheck, IconLayers, IconMetric, IconPin, IconTable, IconBoard } from '../../ui/icons';
import { Orb, type OrbState } from '../../ui/Orb';
import { dHref, useModelColor } from '../../ui/lib';
import { Bars, Ring, TimeSeries, type BarItem } from '../../viz';
import { plain, tokenize, WORD_DUR, WORD_MS, type Exchange, type SourceRects } from './lib';

/**
 * 一条 AI 回答（规范第 4.4 节）。live 时按阶段依次出现：
 *   thinking 检索中（光球「思考」，骨架闪烁）
 *   → text   文字逐词浮现，由模糊变清晰（光球「回答」）
 *   → viz    大数字滚动 + 图表生长
 *   → done   来源链接与操作按钮浮现（光球回到「空闲」）
 * 不是 live（示例对话）或关闭特效时直接显示终态。
 * 兜底回答（ok=false）没有「生成看板」，改为推荐问题。
 */

type Phase = 'thinking' | 'text' | 'viz' | 'done';
const ORB_OF: Record<Phase, OrbState> = { thinking: 'thinking', text: 'speaking', viz: 'speaking', done: 'idle' };

export function AnswerBlock({ ex, a, suggestions, nameOf, built, onPhase, onAsk, onBuild, register }: {
  ex: Exchange;
  a: DAnswer;
  suggestions: string[];
  nameOf: (id: string) => { name: string; kind: string } | null;
  built: boolean;
  onPhase?: (s: OrbState) => void;
  onAsk: (q: string) => void;
  onBuild: (id: number) => void;
  register: (id: number, fn: (() => SourceRects) | null) => void;
}) {
  const { fx } = useSite();
  const colorOf = useModelColor();
  const card = useRef<HTMLElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const figsRef = useRef<HTMLDListElement>(null);
  const tokens = useMemo(() => tokenize(a.text), [a.text]);
  const live = ex.live && fx.motion;
  const [phase, setPhase] = useState<Phase>(live ? 'thinking' : 'done');
  const [table, setTable] = useState(false);
  const [pinned, setPinned] = useState(false);
  const at = (p: Phase) => ['thinking', 'text', 'viz', 'done'].indexOf(phase) >= ['thinking', 'text', 'viz', 'done'].indexOf(p);

  // 阶段推进（标签页在后台时 setTimeout 也会走，只是被节流，不会卡住）
  useEffect(() => {
    if (phase === 'done') return;
    const textMs = tokens.length * WORD_MS + WORD_DUR;
    const hasViz = a.figures.length > 0 || !!a.chart;
    const wait = phase === 'thinking' ? 760 : phase === 'text' ? Math.max(480, textMs - 260) : hasViz ? 1000 : 120;
    const next: Phase = phase === 'thinking' ? 'text' : phase === 'text' ? (hasViz ? 'viz' : 'done') : 'done';
    const t = window.setTimeout(() => setPhase(next), wait);
    return () => clearTimeout(t);
  }, [phase, tokens.length, a.figures.length, a.chart]);

  useEffect(() => { onPhase?.(ORB_OF[phase]); }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // 「用问答生成看板」进来的：回答播完后自动生成
  useEffect(() => {
    if (!ex.build || !a.ok || phase !== 'done') return;
    const t = window.setTimeout(() => onBuild(ex.id), live ? 420 : 160);
    return () => clearTimeout(t);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // 给草稿区提供飞行起点
  useEffect(() => {
    register(ex.id, () => ({
      figs: Array.from(figsRef.current?.querySelectorAll('.vd-ct-fig') ?? [], el => el.getBoundingClientRect()),
      chart: chartRef.current?.getBoundingClientRect() ?? null,
      card: card.current!.getBoundingClientRect(),
    }));
    return () => register(ex.id, null);
  }, [ex.id, register]);

  const boardTitle = BOARD_LAYOUTS[a.board].title;
  const orbState = ORB_OF[phase];
  const showViz = at('viz') && (a.figures.length > 0 || !!a.chart);
  const anim = live ? ' is-anim' : '';
  const hits = [...new Set(a.matched)];

  return (
    <article ref={card} className={`vd-ct-answer${a.ok ? '' : ' is-fallback'}${anim}`} aria-label={`回答：${a.title}`} aria-busy={phase !== 'done'}>
      <span className="vd-panel-hud" aria-hidden="true"><i /><i /><i /><i /></span>
      <header className="vd-ct-head">
        <Orb state={orbState} size={24} />
        <span className="vd-ct-who">数据助手</span>
        {at('text') && <span className="vd-ct-title">{a.title}</span>}
        <span className="vd-ct-note">{phase === 'thinking' ? '正在匹配演示数据…' : '按关键词匹配演示数据'}</span>
      </header>

      {phase === 'thinking' ? (
        <div className="vd-ct-think" role="status">
          <span className="vd-sr">正在按关键词匹配演示数据</span>
          <i /><i /><i />
        </div>
      ) : (
        <>
          <p className="vd-sr">{plain(a.text)}</p>
          <p className="vd-ct-text" aria-hidden="true">
            {tokens.map((t, i) => {
              const style = live ? ({ '--i': i } as CSSProperties) : undefined;
              const cls = live ? 'vd-ct-w' : undefined;
              return t.strong ? <strong key={i} className={cls} style={style}>{t.text}</strong> : <span key={i} className={cls} style={style}>{t.text}</span>;
            })}
          </p>
        </>
      )}

      {showViz && (
        <div className={`vd-ct-viz${anim}`}>
          {a.figures.length > 0 && (
            <dl ref={figsRef} className="vd-ct-figs" style={{ '--n': a.figures.length } as CSSProperties}>
              {a.figures.map(f => <div key={f.label} className="vd-ct-fig"><dt className="vd-sr">{f.label}</dt><dd><Figure f={f} /></dd></div>)}
            </dl>
          )}
          {a.chart && (
            <div ref={chartRef} className="vd-ct-chart">
              <p className="vd-ct-chart-h">
                <span>{a.chart.label}</span>
                <span className="vd-ct-chart-tag">{table ? 'TABLE · 数据表' : a.chart.kind === 'line' ? 'SERIES · 悬停看每月' : `BARS · ${a.chart.items.length} 项`}</span>
              </p>
              <div className={`vd-ct-chart-body is-${a.chart.kind}${a.chart.kind !== 'line' && isRing(a.chart) ? ' is-ring' : ''}${table && a.chart.kind !== 'line' ? ' is-table' : ''}`}
                style={a.chart.kind !== 'line' ? { '--rows': a.chart.items.length } as CSSProperties : undefined}>
                <ChartView chart={a.chart} table={table} colorOf={colorOf} />
              </div>
            </div>
          )}
        </div>
      )}

      {at('done') && (
        <div className={`vd-ct-tail${anim}`}>
          {a.ok && a.sources.length > 0 && (
            <p className="vd-ct-src">
              <span className="vd-ct-src-k">来源</span>
              {a.sources.map(id => {
                const it = nameOf(id);
                if (!it) return null;
                return (
                  <a key={id} className="vd-ct-src-link" href={dHref('assets', null, { asset: id })}>
                    {it.kind === 'table' ? <IconTable /> : it.kind === 'board' ? <IconBoard /> : <IconMetric />}
                    {it.name}
                    <IconArrowUpRight className="vd-ct-src-go" />
                  </a>
                );
              })}
            </p>
          )}

          {!a.ok && (
            <div className="vd-ct-try">
              <p className="vd-ct-try-h">可以这样问</p>
              <ul className="vd-ct-try-list">
                {suggestions.slice(0, 5).map(q => <li key={q}><Chip onClick={() => onAsk(q)}>{q}</Chip></li>)}
              </ul>
            </div>
          )}

          <div className="vd-ct-actions">
            {a.ok ? (
              <>
                <button type="button" className="vd-btn is-accent" onClick={() => onBuild(ex.id)}>
                  <IconLayers />{built ? '重新生成看板' : '生成看板'}
                </button>
                <button type="button" className={`vd-btn${pinned ? ' is-done' : ''}`} aria-pressed={pinned} onClick={() => setPinned(p => !p)}>
                  {pinned ? <IconCheck /> : <IconPin />}{pinned ? '已钉到看板' : '钉到看板'}
                </button>
              </>
            ) : (
              <a className="vd-btn" href={dHref('assets')}><IconAssets />浏览资产</a>
            )}
            {a.chart && (
              <button type="button" className="vd-btn is-ghost" aria-pressed={table} onClick={() => setTable(t => !t)}>
                <IconTable />{table ? '换回图表' : '换成表格'}
              </button>
            )}
            {hits.length > 0 && <span className="vd-ct-hit" title="命中的关键词">命中 · {hits.join(' / ')}</span>}
          </div>
          {pinned && <p className="vd-ct-toast" role="status"><IconCheck />已钉到「{boardTitle}」看板。演示：只在本页保留，刷新后还原。</p>}
        </div>
      )}
    </article>
  );
}

function Figure({ f }: { f: AnswerFigure }) {
  if (f.kind === 'pct') return <BigNumber label={f.label} value={f.value} format={v => pctNumber(v)} unit="%" size="md" />;
  if (f.kind === 'count') return <BigNumber label={f.label} value={f.value} format={v => int(v)} unit={f.unit} size="md" />;
  return <BigNumber label={f.label} value={f.value} format={v => wan(v)} unit="万元" size="md" />;
}

/** 进度类、且都是型号（不超过 4 个）时画同心环，其余画条形 */
const isRing = (chart: AnswerChart) => chart.kind === 'progress' && chart.items.length <= 4 && chart.items.every(i => i.model);

/** 回答里的图表：条形 / 进度（型号用同心环，其余用带参照的条）/ 月度折线；可换成表格 */
function ChartView({ chart, table, colorOf }: { chart: AnswerChart; table: boolean; colorOf: (id: string) => string }) {
  if (chart.kind === 'line') {
    const color = chart.model ? colorOf(chart.model) : 'var(--accent)';
    const notes = chart.hi !== undefined && chart.hi >= 0 ? [{ index: chart.hi, text: `最高 ${chart.display[chart.hi]} 万元` }] : [];
    return (
      <TimeSeries
        labels={chart.labels}
        series={[{ id: chart.model ?? 'total', label: chart.model ?? '合计', color, values: chart.values }]}
        type={table ? 'table' : 'area'}
        notes={notes}
        height="100%"
        ariaLabel={`${chart.label}：${chart.labels.map((l, i) => `${l} ${chart.display[i]}`).join('，')}`}
        valueFormat={v => wan(v)}
        unit="万元"
      />
    );
  }
  const anyHi = chart.items.some(i => i.hi);
  const colorFor = (i: AnswerBar) => {
    const base = i.model ? colorOf(i.model) : 'var(--accent)';
    if (!anyHi || i.hi) return base;
    return i.model ? `color-mix(in srgb, ${base} 42%, transparent)` : 'rgb(var(--accent-rgb) / .32)';
  };
  if (table) {
    return (
      <table className="vd-ct-table">
        <caption className="vd-sr">{chart.label}</caption>
        <thead><tr><th scope="col">名称</th><th scope="col">{chart.kind === 'progress' ? '进度' : '数值'}</th></tr></thead>
        <tbody>
          {chart.items.map(i => (
            <tr key={i.key} className={i.hi ? 'is-hi' : undefined}>
              <th scope="row">{i.model && <i style={{ background: colorOf(i.model) }} aria-hidden="true" />}{i.label}</th>
              <td>{i.display}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (isRing(chart)) {
    const focus = chart.items.find(i => i.hi) ?? chart.items[0];
    return (
      <Ring
        items={chart.items.map(i => ({ key: i.key, label: i.label, ratio: i.value, color: colorOf(i.model!) }))}
        center={<span className="vd-ct-ring-c"><b>{focus.display.replace('%', '')}<small>%</small></b><span>{focus.label}</span></span>}
        ariaLabel={`${chart.label}：${chart.items.map(i => `${i.label} ${i.display}`).join('，')}`}
      />
    );
  }
  const items: BarItem[] = chart.items.map(i => ({
    key: i.key, label: i.label, value: i.value, display: i.display, color: colorFor(i),
    ...(chart.kind === 'progress' ? { secondary: 1 } : {}),
  }));
  return <Bars items={items} ariaLabel={`${chart.label}：${chart.items.map(i => `${i.label} ${i.display}`).join('，')}`} />;
}
