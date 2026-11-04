import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { navigate } from '../../../../core/route';
import { useSite } from '../../../../core/provider';
import { BOARD_LAYOUTS } from '../../model/boards';
import type { WidgetConfig } from '../../model/types';
import { IconArrowRight, IconLayers, IconPlus, IconUndo } from '../../ui/icons';
import { dHref } from '../../ui/lib';
import { Thumb } from './Thumbs';
import { FLY_DUR, FLY_STAGGER, isWide, KIND_LABEL, type Draft, type SourceRects } from './lib';

/**
 * 右栏「看板草稿」（规范第 4.4 节、第 4.7 节第 1 条）。
 * - 点回答里的「生成看板」后，answer.widgets 一块块从回答处飞进网格（FLIP：先把组件放到终点，
 *   再用一张浮在最上层的飞行卡从起点矩形缩放、沿弧线飞到终点），逐块错开 120ms；落地后组件内容淡入；
 * - 全部落地后出现「打开看板」，跳到 #/d/board/<id>?generated=1（打开现有看板，看板页播放拼装入场）；
 * - 关闭特效时直接显示拼好的结果；
 * - 没有草稿时显示虚线空位（按最新一条回答会生成的组件排好），可以直接「用最新回答生成」。
 */
export function DraftBoard({ draft, preview, onBuildLatest, onClear }: {
  draft: Draft | null;
  preview: { widgets: WidgetConfig[]; board: Draft['board']; q: string } | null;
  onBuildLatest: () => void;
  onClear: () => void;
}) {
  const { fx } = useSite();
  const grid = useRef<HTMLDivElement>(null);
  const [landed, setLanded] = useState<{ nonce: number; n: Set<number> }>({ nonce: -1, n: new Set() });
  const animated = !!draft && fx.motion && !!draft.from;
  const isLanded = (i: number) => !animated || (landed.nonce === draft!.nonce && landed.n.has(i));
  const total = draft?.widgets.length ?? 0;
  const count = draft ? draft.widgets.filter((_, i) => isLanded(i)).length : 0;
  const done = !!draft && count === total;

  useLayoutEffect(() => {
    if (!draft || !animated || !grid.current) return;
    const from = draft.from!;
    const slots = Array.from(grid.current.querySelectorAll<HTMLElement>('[data-slot]'));
    let figI = 0;
    const flights = slots.map((el, i) => {
      const w = draft.widgets[i];
      const small = w && (w.kind === 'kpi' || w.kind === 'stream' || w.kind === 'ring');
      const src = (small && from.figs.length ? from.figs[figI++ % from.figs.length] : from.chart) ?? from.card;
      return fly(el, src, i, w, () => setLanded(s => {
        const n = new Set(s.nonce === draft.nonce ? s.n : []);
        n.add(i);
        return { nonce: draft.nonce, n };
      }));
    });
    return () => flights.forEach(f => f());
  }, [draft?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const layout = draft ? BOARD_LAYOUTS[draft.board] : preview ? BOARD_LAYOUTS[preview.board] : null;
  const ghost = draft ? null : preview?.widgets ?? null;

  return (
    <section className={`vd-ct-draft${draft ? ' has-draft' : ''}${done ? ' is-done' : ''}`} aria-labelledby="vd-ct-draft-h">
      <span className="vd-panel-hud" aria-hidden="true"><i /><i /><i /><i /></span>
      <header className="vd-ct-draft-head">
        <h2 id="vd-ct-draft-h" className="vd-ct-draft-h">看板草稿<span className="vd-kicker">DRAFT</span></h2>
        <span className={`vd-ct-draft-count${done ? ' is-done' : ''}`} aria-live="polite">
          {draft ? <><b>{count}</b>/{total}{done ? ' · 已拼好' : ' · 拼装中'}</> : '0 个组件'}
        </span>
      </header>
      {draft && (
        <div className="vd-ct-draft-meta">
          <p className="vd-ct-draft-title">{layout!.title}</p>
          <p className="vd-ct-draft-from" title={draft.q}>来自「{draft.q}」</p>
        </div>
      )}

      <div ref={grid} className="vd-ct-grid" role="list" aria-label="草稿里的组件">
        {draft && draft.widgets.map((w, i) => (
          <div key={`${draft.nonce}-${w.id}`} role="listitem" data-slot={i}
            className={`vd-ct-slot${isWide(w) ? ' is-wide' : ''}${isLanded(i) ? (animated ? ' is-land' : '') : ' is-wait'}`}
            style={{ '--i': i } as CSSProperties} aria-label={`${w.title}（${KIND_LABEL[w.kind]}）`}>
            <Thumb w={w} />
          </div>
        ))}
        {ghost && ghost.map((w, i) => (
          <div key={`g-${w.id}`} className={`vd-ct-slot is-ghost${isWide(w) ? ' is-wide' : ''}`} style={{ '--i': i } as CSSProperties} aria-hidden="true" />
        ))}
        {!draft && !ghost && Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={`vd-ct-slot is-ghost${i === 1 || i === 2 ? ' is-wide' : ''}`} aria-hidden="true" />
        ))}
        {!draft && (
          <div className="vd-ct-empty">
            <span className="vd-empty-ic" aria-hidden="true"><IconLayers size={20} /></span>
            <p className="vd-empty-h">还没有草稿</p>
            <p className="vd-empty-t">点回答下方的「生成看板」，指标和图表会一块块飞进这里，拼成{layout ? `「${layout.title}」` : '一张'}看板。</p>
            {ghost && ghost.length > 0 && (
              <ul className="vd-ct-empty-list" aria-label="将生成的组件">
                {ghost.map(w => <li key={w.id}>{KIND_LABEL[w.kind]}</li>)}
              </ul>
            )}
            {preview && <button type="button" className="vd-btn is-accent" onClick={onBuildLatest}><IconPlus />用最新回答生成</button>}
          </div>
        )}
      </div>

      <footer className="vd-ct-draft-foot">
        {draft ? (
          <>
            <button type="button" className="vd-btn is-ghost" onClick={onClear}><IconUndo />清空</button>
            <span className="vd-ct-draft-note">打开现有的「{layout!.title}」看板，带拼装入场</span>
            {done
              ? <button type="button" className="vd-btn is-primary vd-ct-open" onClick={() => navigate(dHref('board', draft.board, { generated: '1' }))}>打开看板<IconArrowRight /></button>
              : <span className="vd-ct-draft-wait" aria-hidden="true"><i /><i /><i /></span>}
          </>
        ) : (
          <span className="vd-ct-draft-note">草稿只在本页保留。看板页的组件可以再编辑。</span>
        )}
      </footer>
    </section>
  );
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * 一块组件的飞行：飞行卡固定定位在终点矩形上，用 transform 从起点矩形（平移 + 缩放）沿一段上拱的弧线回到原位。
 * 落地后回调 onLand，飞行卡再淡出移除。返回取消函数。
 * 兜底：标签页在后台时动画帧可能不走，到点后用定时器强制落地。
 */
function fly(target: HTMLElement, from: DOMRect, i: number, w: WidgetConfig | undefined, onLand: () => void) {
  const to = target.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = `vd-ct-flyer${w && isWide(w) ? ' is-wide' : ''}`;
  el.setAttribute('aria-hidden', 'true');
  el.style.left = `${to.left}px`;
  el.style.top = `${to.top}px`;
  el.style.width = `${to.width}px`;
  el.style.height = `${to.height}px`;
  const t = document.createElement('span');
  t.className = 'vd-ct-flyer-t';
  t.textContent = w ? w.title : '';
  el.appendChild(t);
  const k = document.createElement('span');
  k.className = 'vd-ct-flyer-k';
  k.textContent = w ? KIND_LABEL[w.kind] : '';
  el.appendChild(k);
  document.body.appendChild(el);

  const sx = Math.max(0.2, from.width / Math.max(1, to.width));
  const sy = Math.max(0.2, from.height / Math.max(1, to.height));
  const dx = from.left - to.left, dy = from.top - to.top;
  const lift = Math.min(64, 24 + Math.abs(dx) * 0.06);
  const delay = i * FLY_STAGGER;
  let finished = false;
  const land = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    onLand();
    try {
      const out = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, easing: 'ease-out', fill: 'forwards' });
      out.onfinish = () => el.remove();
      window.setTimeout(() => el.remove(), 600);
    } catch { el.remove(); }
  };
  const anim = el.animate([
    { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0 },
    { opacity: 1, offset: 0.16 },
    { transform: `translate(${dx * 0.36}px, ${dy * 0.36 - lift}px) scale(${lerp(sx, 1, 0.72)}, ${lerp(sy, 1, 0.72)})`, offset: 0.6 },
    { transform: 'none', opacity: 1 },
  ], { duration: FLY_DUR, delay, easing: 'cubic-bezier(.33, .8, .25, 1)', fill: 'both' });
  anim.onfinish = land;
  const timer = window.setTimeout(land, delay + FLY_DUR + 260);
  return () => { finished = true; clearTimeout(timer); anim.cancel(); el.remove(); };
}

export type { SourceRects };
