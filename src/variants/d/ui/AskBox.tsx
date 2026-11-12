import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useSite } from '../../../core/provider';
import { Chip } from './Chip';
import { IconArrowUp, IconClose, IconSparkle } from './icons';
import { Orb, type OrbState } from './Orb';
import { useOnScreen, useTypewriter } from './lib';

/**
 * 问答框（由 B 版 Ask.tsx 移植改造）：左侧光球头像，聚焦时旋转的极光描边，占位文字打字机式轮播 suggestions。
 * - 只负责输入：提交时调用 onSubmit(q)，回答由页面自己处理；
 * - 空着按回车：提交占位里正在打的那句；Tab：把那句填进输入框；
 * - size：hero（欢迎页大号）/ dock（问答页底部）；
 * - 下方一排建议问题（hero 3 条、dock 4 条），点击直接提交；extra 接在这一排最后（欢迎页放「用问答生成看板」）；
 * - hero 不显示 Tab 键提示和下方的说明行（欢迎页副标题里已经写了），说明只留给读屏。
 */
export function AskBox({ onSubmit, suggestions, size, autoFocus, extra }: {
  onSubmit: (q: string) => void;
  suggestions: string[];
  size: 'hero' | 'dock';
  autoFocus?: boolean;
  extra?: ReactNode;
}) {
  const { fx } = useSite();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const onScreen = useOnScreen(form);
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const [sent, setSent] = useState(false);
  const typed = useTypewriter(suggestions, fx.motion && !value, !onScreen);
  const sentTimer = useRef(0);

  useEffect(() => {
    if (!autoFocus) return;
    const t = window.setTimeout(() => input.current?.focus({ preventScroll: true }), 60);
    return () => clearTimeout(t);
  }, [autoFocus]);
  useEffect(() => () => clearTimeout(sentTimer.current), []);

  const current = suggestions[typed.index] ?? suggestions[0] ?? '';
  const submit = (q: string) => {
    const text = q.trim();
    if (!text) return;
    onSubmit(text);
    setValue('');
    setSent(true);
    clearTimeout(sentTimer.current);
    sentTimer.current = window.setTimeout(() => setSent(false), 1100);
  };
  const onForm = (e: FormEvent) => { e.preventDefault(); submit(value || current); };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab' && !e.shiftKey && !value && current) { e.preventDefault(); setValue(current); }
    if (e.key === 'Escape' && value) { e.preventDefault(); setValue(''); }
  };

  const orbState: OrbState = sent ? 'thinking' : focused ? 'focus' : 'idle';
  const hero = size === 'hero';
  const hintId = `${id}-hint`;

  return (
    <div className={`vd-ask is-${size}`}>
      <form ref={form} className={`vd-askbox${focused ? ' is-focus' : ''}${sent ? ' is-sent' : ''}`} onSubmit={onForm} role="search" aria-label="向演示数据提问">
        <span className="vd-askbox-ring" aria-hidden="true" />
        <span className="vd-askbox-glow" aria-hidden="true" />
        <span className="vd-askbox-orb"><Orb state={orbState} size={hero ? 40 : 28} /></span>
        <label className="vd-sr" htmlFor={id}>向演示数据提问</label>
        <div className="vd-askbox-field">
          <input
            ref={input}
            id={id}
            type="text"
            autoComplete="off"
            enterKeyHint="send"
            value={value}
            onChange={e => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={onKey}
            aria-describedby={hintId}
          />
          {!value && (
            <span className="vd-askbox-ph" aria-hidden="true">
              <span className="vd-askbox-ph-text">{typed.text}</span><i className="vd-caret" />
            </span>
          )}
        </div>
        {value && <button type="button" className="vd-askbox-clear" onClick={() => { setValue(''); input.current?.focus(); }} aria-label="清空输入"><IconClose /></button>}
        <button type="submit" className="vd-askbox-go" aria-label="提问"><IconArrowUp size={hero ? 20 : 16} /></button>
      </form>
      <p id={hintId} className={hero ? 'vd-sr' : 'vd-ask-note'}>
        <IconSparkle />按关键词匹配演示数据，不是 AI 生成。{hero ? '空着按回车，会问占位里的这句；按 Tab 把这句填进输入框。' : ''}
      </p>
      {(suggestions.length > 0 || extra) && (
        <ul className="vd-suggest" aria-label="建议问题">
          {suggestions.slice(0, hero ? 3 : 4).map(q => (
            <li key={q}><Chip onClick={() => submit(q)}>{q}</Chip></li>
          ))}
          {extra && <li>{extra}</li>}
        </ul>
      )}
    </div>
  );
}
