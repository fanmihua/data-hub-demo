import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Route } from '../../../../core/route';
import { navigate } from '../../../../core/route';
import { useDerived, useSite } from '../../../../core/provider';
import { answerFor, suggestedQuestions, type DAnswer } from '../../model/answers';
import { BOARD_LAYOUTS } from '../../model/boards';
import { buildCatalog } from '../../model/catalog';
import { Panel } from '../../ui/Panel';
import type { OrbState } from '../../ui/Orb';
import { IconChat, IconHistory, IconPlus, IconSparkle } from '../../ui/icons';
import { dHref } from '../../ui/lib';
import { DraftBoard } from './DraftBoard';
import { Thread } from './Thread';
import type { Draft, Exchange, SourceRects } from './lib';
import './chat.css';

/**
 * 问答页 #/d/chat（规范第 4.4 节）。三栏一屏：
 *   左 会话历史（本次的问题 + 可以这样问） │ 中 对话流 + 底部问答框 │ 右 看板草稿
 * - 默认已有一段示例对话（静止时也完整）；网址带 q 时追加这个问题并播放回答；
 *   带 build=1（欢迎页「用问答生成看板」）时，回答播完自动生成草稿。
 * - 在本页再提问：先在本地追加，再把 q 写进网址（同一个 q 不会重复追加）。
 */

let seq = 0;
const nextId = () => ++seq;
/** 示例对话：一问总体目标、一问第一个型号的回款（问题随数据变化） */
const sampleOf = (questions: string[]): Exchange[] =>
  ['年度目标完成了多少', questions[0] ?? '合同付款进度如何'].map(q => ({ id: nextId(), q, live: false }));

export default function ChatScreen({ route }: { route: Route }) {
  const { data, fx } = useSite();
  const d = useDerived();
  const questions = useMemo(() => suggestedQuestions(d), [d]);
  const catalog = useMemo(() => buildCatalog(data, d), [data, d]);
  const nameOf = useCallback((id: string) => {
    const it = catalog.find(i => i.id === id);
    return it ? { name: it.name, kind: it.kind } : null;
  }, [catalog]);

  const q0 = route.query.get('q')?.trim() || '';
  const [init] = useState(() => {
    const sample: Exchange[] = sampleOf(questions);
    if (!q0) return { exchanges: sample, scrollTo: null };
    const ex: Exchange = { id: nextId(), q: q0, live: true, build: route.query.get('build') === '1' };
    return { exchanges: [...sample, ex], scrollTo: { id: ex.id, n: 0 } };
  });
  const [exchanges, setExchanges] = useState<Exchange[]>(init.exchanges);
  const [scrollTo, setScrollTo] = useState<{ id: number; n: number } | null>(init.scrollTo);
  const lastQ = useRef(q0);

  const append = useCallback((q: string, build = false) => {
    const id = nextId();
    setExchanges(xs => [...xs, { id, q, live: true, build }]);
    setScrollTo(s => ({ id, n: (s?.n ?? 0) + 1 }));
  }, []);

  // 网址里的 q 变化（从别的页面带着问题进来、浏览器前进后退）
  const qs = route.query.toString();
  useEffect(() => {
    const q = route.query.get('q')?.trim() || '';
    if (!q || q === lastQ.current) return;
    lastQ.current = q;
    append(q, route.query.get('build') === '1');
  }, [qs]); // eslint-disable-line react-hooks/exhaustive-deps

  const ask = useCallback((q: string) => {
    const text = q.trim();
    if (!text) return;
    lastQ.current = text;
    append(text);
    navigate(dHref('chat', null, { q: text }));
  }, [append]);

  const answers = useMemo(() => new Map<number, DAnswer>(exchanges.map(e => [e.id, answerFor(e.q, d, data)])), [exchanges, d, data]);

  // 助手条上的光球：跟随最后一轮正在播放的回答
  const [orb, setOrb] = useState<OrbState>('idle');
  const tailId = exchanges[exchanges.length - 1]?.id;
  const onPhase = useCallback((id: number, s: OrbState) => { if (id === tailId) setOrb(s); }, [tailId]);

  // 生成看板
  const measures = useRef(new Map<number, () => SourceRects>());
  const register = useCallback((id: number, fn: (() => SourceRects) | null) => {
    if (fn) measures.current.set(id, fn); else measures.current.delete(id);
  }, []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const build = useCallback((id: number) => {
    const ex = exchanges.find(e => e.id === id);
    const a = answers.get(id);
    if (!ex || !a || !a.ok || !a.widgets.length) return;
    const from = fx.motion ? measures.current.get(id)?.() ?? null : null;
    setDraft({ exId: id, q: ex.q, board: a.board, widgets: a.widgets, from, nonce: Date.now() });
  }, [exchanges, answers, fx.motion]);

  const latestOk = [...exchanges].reverse().find(e => answers.get(e.id)?.ok);
  const latestA = latestOk ? answers.get(latestOk.id)! : null;
  const preview = latestOk && latestA ? { widgets: latestA.widgets, board: latestA.board, q: latestOk.q } : null;

  const reset = () => {
    lastQ.current = '';
    const sample = sampleOf(questions);
    setExchanges(sample);
    setDraft(null);
    setScrollTo({ id: sample[sample.length - 1].id, n: 0 });
    navigate(dHref('chat'));
  };

  const asked = new Set(exchanges.map(e => e.q));
  const more = questions.filter(q => !asked.has(q));

  return (
    <div className="vd-screen vd-ct">
      <Panel kicker="HISTORY" title="会话" className="vd-ct-hist"
        actions={<button type="button" className="vd-icon-btn" onClick={reset} aria-label="新对话（回到示例对话）" title="新对话"><IconPlus /></button>}>
        <p className="vd-ct-hist-h"><IconHistory />本次会话<span>{exchanges.length}</span></p>
        <ul className="vd-ct-hist-list">
          {exchanges.map(e => {
            const a = answers.get(e.id);
            return (
              <li key={e.id}>
                <button type="button" className={`vd-ct-hist-item${e.id === tailId ? ' is-on' : ''}`} onClick={() => setScrollTo(s => ({ id: e.id, n: (s?.n ?? 0) + 1 }))}>
                  <IconChat />
                  <span className="vd-ct-hist-main">
                    <b>{e.q}</b>
                    <small>{a?.ok ? `${a.title} · ${BOARD_LAYOUTS[a.board].title}` : '没有匹配到'}</small>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {more.length > 0 && (
          <>
            <p className="vd-ct-hist-h"><IconSparkle />可以这样问</p>
            <ul className="vd-ct-hist-list">
              {more.map(q => (
                <li key={q}>
                  <button type="button" className="vd-ct-hist-item is-suggest" onClick={() => ask(q)}>
                    <span className="vd-ct-hist-main"><b>{q}</b></span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>

      <Thread
        exchanges={exchanges}
        answers={answers}
        orb={orb}
        suggestions={questions}
        nameOf={nameOf}
        builtId={draft?.exId ?? null}
        scrollTo={scrollTo}
        onPhase={onPhase}
        onAsk={ask}
        onBuild={build}
        register={register}
      />

      <DraftBoard draft={draft} preview={preview} onBuildLatest={() => latestOk && build(latestOk.id)} onClear={() => setDraft(null)} />
    </div>
  );
}
