import { useLayoutEffect, useRef } from 'react';
import { useSite } from '../../../../core/provider';
import type { DAnswer } from '../../model/answers';
import { AskBox } from '../../ui/AskBox';
import { Orb, type OrbState } from '../../ui/Orb';
import { AnswerBlock } from './AnswerBlock';
import type { Exchange, SourceRects } from './lib';

/**
 * 中栏对话流：顶部是助手条（WebGL 光球 + 状态），中间是可以在内部滚动的对话，底部是问答框和建议问题。
 * - 用户问题右对齐，AI 回答左对齐；
 * - 追加新问题时，把这一轮滚到顶部，回答在下面依次播放（最后一轮至少占满一屏，滚动才落得住）；
 * - 页面初次打开、只有示例对话时，直接停在最底部。
 */
const STATE_LABEL: Record<OrbState, string> = { idle: '空闲', focus: '空闲', thinking: '正在检索', speaking: '正在回答' };

export function Thread({ exchanges, answers, orb, suggestions, nameOf, builtId, scrollTo, onPhase, onAsk, onBuild, register }: {
  exchanges: Exchange[];
  answers: Map<number, DAnswer>;
  orb: OrbState;
  suggestions: string[];
  nameOf: (id: string) => { name: string; kind: string } | null;
  builtId: number | null;
  /** 需要滚到的那一轮（追加新问题、点左栏历史时变化） */
  scrollTo: { id: number; n: number } | null;
  onPhase: (id: number, s: OrbState) => void;
  onAsk: (q: string) => void;
  onBuild: (id: number) => void;
  register: (id: number, fn: (() => SourceRects) | null) => void;
}) {
  const { fx } = useSite();
  const scroller = useRef<HTMLDivElement>(null);
  const tail = exchanges[exchanges.length - 1];

  // 初次打开：只有示例对话时停在底部
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || scrollTo) return;
    el.scrollTop = el.scrollHeight;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !scrollTo) return;
    const row = el.querySelector<HTMLElement>(`[data-ex="${scrollTo.id}"]`);
    if (!row) return;
    el.scrollTo({ top: Math.max(0, row.offsetTop - 12), behavior: fx.motion && scrollTo.n > 0 ? 'smooth' : 'auto' });
  }, [scrollTo?.id, scrollTo?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="vd-ct-thread" aria-label="对话">
      <header className="vd-ct-bar">
        <span className="vd-ct-bar-orb"><Orb state={orb} size={40} /></span>
        <div className="vd-ct-bar-text">
          <p className="vd-ct-bar-name">数据助手 <span className={`vd-ct-state is-${orb}`} aria-live="polite"><i aria-hidden="true" />{STATE_LABEL[orb]}</span></p>
          <p className="vd-ct-bar-note">按关键词匹配演示数据，不调用模型，不是 AI 生成</p>
        </div>
      </header>

      <div ref={scroller} className="vd-ct-scroll" tabIndex={0} aria-label="对话记录">
        {exchanges.map(ex => {
          const a = answers.get(ex.id);
          if (!a) return null;
          return (
            <div key={ex.id} data-ex={ex.id} className={`vd-ct-ex${ex === tail && ex.live ? ' is-tail' : ''}`}>
              <p className={`vd-ct-user${ex.live && fx.motion ? ' is-anim' : ''}`}><span className="vd-sr">你问：</span>{ex.q}</p>
              <AnswerBlock
                ex={ex}
                a={a}
                suggestions={suggestions}
                nameOf={nameOf}
                built={builtId === ex.id}
                onPhase={s => onPhase(ex.id, s)}
                onAsk={onAsk}
                onBuild={onBuild}
                register={register}
              />
            </div>
          );
        })}
      </div>

      <div className="vd-ct-dock">
        <AskBox size="dock" suggestions={suggestions} onSubmit={onAsk} />
      </div>
    </section>
  );
}
