import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowRightIcon, ArrowUpIcon, SparkleIcon, XIcon } from '@phosphor-icons/react';
import { NumberRoller } from '../../core/ui/NumberRoller';
import { useSite } from '../../core/provider';
import { dateTimeLabel, int, pctNumber, wan } from '../../core/data/format';
import type { Route } from '../../core/route';
import { answer, sampleQuestions, type Answer, type AnswerFigure } from './answer';
import { MiniChart } from './charts/Mini';
import { bHref, plain, tokenize, useModelColor, useOnScreen, useTypewriter } from './lib';

export interface AskHandle { focus: () => void }

export interface AskSignal { energy: number; pulse: number; thinking: boolean }

/**
 * 对话式检索框 + 回答卡片。
 * - 占位文字是打字机轮播的示例问题（空输入时按回车 / Tab 直接用当前这句）；
 * - 提交后短暂「检索中」，然后回答逐词浮现（模糊 → 清晰），再生成小图和关键数字；
 * - onSignal 把聚焦 / 键入 / 检索状态交给光球。
 */
export const AskBox = forwardRef<AskHandle, { route: Route; onSignal?: (s: AskSignal) => void; compact?: boolean; autoFocus?: boolean }>(function AskBox({ route, onSignal, compact = false, autoFocus = false }, ref) {
  const { derived, data, fx } = useSite();
  const input = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const onScreen = useOnScreen(form);
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const [pulse, setPulse] = useState(0);
  const [thinking, setThinking] = useState(false);
  const [result, setResult] = useState<{ a: Answer; n: number } | null>(null);
  const questions = useMemo(() => sampleQuestions(derived), [derived]);
  const typed = useTypewriter(questions, fx.motion && !value, !onScreen);
  const timer = useRef(0);

  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus({ preventScroll: true }) }), []);
  useEffect(() => { onSignal?.({ energy: focused ? 1 : 0, pulse, thinking }); }, [focused, pulse, thinking]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (autoFocus) setTimeout(() => input.current?.focus(), 40); }, [autoFocus]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const run = (q: string) => {
    const text = q.trim();
    if (!text) return;
    setValue(text);
    clearTimeout(timer.current);
    const a = answer(text, derived, data);
    if (!fx.motion) { setResult(r => ({ a, n: (r?.n ?? 0) + 1 })); return; }
    setThinking(true);
    timer.current = window.setTimeout(() => { setThinking(false); setResult(r => ({ a, n: (r?.n ?? 0) + 1 })); }, 720);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); run(value || typed || questions[0]); };

  return (
    <div className={`vb-ask${compact ? ' is-compact' : ''}`}>
      <form ref={form} className={`vb-askbox${focused ? ' is-focus' : ''}${thinking ? ' is-thinking' : ''}`} onSubmit={submit} role="search">
        <span className="vb-askbox-glow" aria-hidden="true" />
        <SparkleIcon className="vb-askbox-icon" size={20} weight="fill" aria-hidden="true" />
        <label className="vb-sr" htmlFor={compact ? 'vb-ask-dialog' : 'vb-ask-hero'}>向演示数据提问</label>
        <div className="vb-askbox-field">
          <input
            ref={input}
            id={compact ? 'vb-ask-dialog' : 'vb-ask-hero'}
            type="text"
            autoComplete="off"
            enterKeyHint="search"
            value={value}
            onChange={e => { setValue(e.target.value); setPulse(p => p + 1); }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={e => { if (e.key === 'Tab' && !value && typed && !e.shiftKey) { e.preventDefault(); setValue(typed.length > 2 ? questions.find(q => q.startsWith(typed)) ?? typed : questions[0]); } }}
            aria-describedby={compact ? undefined : 'vb-ask-hint'}
          />
          {!value && (
            <span className="vb-askbox-ph" aria-hidden="true">
              {typed}<i className="vb-caret" />
            </span>
          )}
        </div>
        {value && <button type="button" className="vb-askbox-clear" onClick={() => { setValue(''); setResult(null); input.current?.focus(); }} aria-label="清空"><XIcon size={16} /></button>}
        <button type="submit" className="vb-askbox-go" aria-label="提问"><ArrowUpIcon size={18} weight="bold" /></button>
      </form>
      {!compact && <p id="vb-ask-hint" className="vb-ask-hint">按关键词匹配本地演示数据，回答不是 AI 生成。空着按回车会问占位里的这句。</p>}
      <ul className="vb-suggest" aria-label="建议问题">
        {questions.slice(0, compact ? 4 : 5).map(q => (
          <li key={q}><button type="button" onClick={() => run(q)}>{q}</button></li>
        ))}
      </ul>
      <div className="vb-answer-slot" aria-live="polite">
        {thinking && <ThinkingCard query={value} />}
        {!thinking && result && <AnswerCard key={result.n} a={result.a} route={route} onAsk={run} onClose={() => setResult(null)} />}
      </div>
    </div>
  );
});

function ThinkingCard({ query }: { query: string }) {
  return (
    <div className="vb-answer is-thinking">
      <div className="vb-answer-head"><span className="vb-answer-dot" aria-hidden="true" /><span>正在检索演示数据：{query}</span></div>
      <div className="vb-shimmer" aria-hidden="true"><i /><i /><i /></div>
    </div>
  );
}

function Figure({ f }: { f: AnswerFigure }) {
  if (f.kind === 'pct') return <><NumberRoller value={f.value} format={v => `${pctNumber(v)}%`} className="vb-fig-num" /></>;
  if (f.kind === 'count') return <><NumberRoller value={f.value} format={v => int(v)} className="vb-fig-num" label={`${int(f.value)} ${f.unit ?? ''}`} /><small aria-hidden="true">{f.unit}</small></>;
  return <><NumberRoller value={f.value} format={v => wan(v)} className="vb-fig-num" label={`${wan(f.value)} 万元`} /><small aria-hidden="true">万元</small></>;
}

export function AnswerCard({ a, route, onAsk, onClose }: { a: Answer; route: Route; onAsk: (q: string) => void; onClose: () => void }) {
  const { derived, data } = useSite();
  const colorOf = useModelColor();
  const tokens = useMemo(() => tokenize(a.text), [a.text]);
  const after = tokens.length * 34 + 160;
  const boardAsset = a.board ? data.assets.find(x => x.id === a.board) : null;
  return (
    <article className={`vb-answer${a.fallback ? ' is-fallback' : ''}`} style={{ ['--after' as string]: `${after}ms` }} aria-label={`回答：${a.title}`}>
      <header className="vb-answer-head">
        <span className="vb-answer-dot" aria-hidden="true" />
        <h3>{a.title}</h3>
        <span className="vb-answer-note">按关键词匹配演示数据</span>
        <button type="button" className="vb-icon-btn" onClick={onClose} aria-label="收起回答"><XIcon size={16} /></button>
      </header>
      <p className="vb-sr">{plain(a.text)}</p>
      <p className="vb-answer-text" aria-hidden="true">
        {tokens.map((t, i) => t.strong
          ? <strong key={i} className="vb-w" style={{ ['--i' as string]: i }}>{t.text}</strong>
          : <span key={i} className="vb-w" style={{ ['--i' as string]: i }}>{t.text}</span>)}
      </p>
      {(a.figures.length > 0 || a.chart) && (
        <div className="vb-answer-viz">
          {a.figures.length > 0 && (
            <dl className="vb-answer-figs">
              {a.figures.map(f => <div key={f.label}><dt>{f.label}</dt><dd><Figure f={f} /></dd></div>)}
            </dl>
          )}
          {a.chart && <MiniChart chart={a.chart} colorOf={m => (m ? colorOf(m) : 'var(--accent)')} />}
        </div>
      )}
      {a.fallback && (
        <ul className="vb-suggest is-inline" aria-label="可以这样问">
          {sampleQuestions(derived).map(q => <li key={q}><button type="button" onClick={() => onAsk(q)}>{q}</button></li>)}
        </ul>
      )}
      <footer className="vb-answer-foot">
        {a.matched.length > 0 && <span className="vb-answer-kw">命中：{a.matched.filter((x, i, xs) => xs.indexOf(x) === i).join(' · ')}</span>}
        <span className="vb-answer-src">演示数据 · 截至 {dateTimeLabel(data.meta.asOf)}</span>
        {boardAsset && <a className="vb-link" href={bHref(route, 'board', boardAsset.id)}>打开「{boardAsset.name}」看板<ArrowRightIcon size={14} aria-hidden="true" /></a>}
      </footer>
    </article>
  );
}
