import { useCallback, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { BoardLayout, WidgetConfig } from '../../model/types';
import { IconGrip, IconPlus, IconTrash } from '../../ui/icons';
import { Glyph } from './glyphs';
import { IconResize } from './icons';
import { KIND_LABEL } from './lib';

/**
 * 编辑状态的图层与交互：
 * - GridGuides：网格线（每个格位一圈虚线插槽 + 格位编号），编辑和「刚生成」拼装时浮现；
 * - CellChrome：组件上的拖拽手柄、名称、删除按钮、缩放角（缩放只做样子，悬停提示暂不支持）；
 * - EmptySlot：删掉组件后的空位「＋ 添加组件」；
 * - useEditDrag + DragGhost：Pointer Events 拖拽（格位之间交换、从组件库拖进空位），拖动时跟手一张小影子卡；
 * - neighborSlot：键盘交换时按方向找相邻格位（按实际位置算，跨行跨列的格位也能找到）。
 */

export type DragSrc = { type: 'cell'; slot: string; w: WidgetConfig } | { type: 'lib'; w: WidgetConfig };
export interface DragState { src: DragSrc; x: number; y: number; over: string | null; ok: boolean }

export function GridGuides({ layout, style }: { layout: BoardLayout; style: CSSProperties }) {
  return (
    <div className="vd-ed-guides" style={style} aria-hidden="true">
      {Object.keys(layout.slots).map((s, i) => <i key={s} style={{ gridArea: s, '--i': i } as CSSProperties} data-name={s.toUpperCase()} />)}
    </div>
  );
}

export function CellChrome({ slot, w, onRemove }: { slot: string; w: WidgetConfig; onRemove: () => void }) {
  return (
    <>
      <div className="vd-ed-bar">
        <span className="vd-ed-handle" aria-hidden="true"><IconGrip /></span>
        <span className="vd-ed-name">{w.title || KIND_LABEL[w.kind]}</span>
        <span className="vd-ed-slot" aria-hidden="true">{slot.toUpperCase()}</span>
        <button type="button" className="vd-ed-del" aria-label={`删除「${w.title || KIND_LABEL[w.kind]}」`}
          onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onRemove(); }}>
          <IconTrash />
        </button>
      </div>
      <span className="vd-ed-resize" data-tip="演示：暂不支持缩放" aria-hidden="true" onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
        <IconResize />
      </span>
    </>
  );
}

export function EmptySlot({ slot, targeted, hint }: { slot: string; targeted: boolean; hint: string }) {
  return (
    <div className={`vd-ed-empty${targeted ? ' is-target' : ''}`}>
      <span className="vd-ed-empty-plus" aria-hidden="true"><IconPlus size={20} /></span>
      <b>添加组件</b>
      <small><span className="vd-mono">{slot.toUpperCase()}</span> · {hint}</small>
    </div>
  );
}

export function useEditDrag({ canDrop, onDrop }: { canDrop: (src: DragSrc, slot: string) => boolean; onDrop: (src: DragSrc, slot: string) => void }) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const suppress = useRef(false);
  const cb = useRef({ canDrop, onDrop });
  cb.current = { canDrop, onDrop };

  const start = useCallback((e: RPointerEvent<HTMLElement>, src: DragSrc) => {
    if (e.button !== 0) return;
    const id = e.pointerId, sx = e.clientX, sy = e.clientY;
    let active = false;
    const slotAt = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest('[data-slot]') as HTMLElement | null)?.dataset.slot ?? null;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      if (!active) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
        active = true;
        document.documentElement.setAttribute('data-vd-dragging', '');
      }
      ev.preventDefault();
      const over = slotAt(ev.clientX, ev.clientY);
      setDrag({ src, x: ev.clientX, y: ev.clientY, over, ok: !!over && cb.current.canDrop(src, over) });
    };
    const finish = (ev: PointerEvent, cancel: boolean) => {
      if (ev.pointerId !== id) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', no);
      if (!active) return;
      document.documentElement.removeAttribute('data-vd-dragging');
      // 拖完松手时浏览器还会派发一次 click，吞掉它，免得被当成「选中」或「取消选中」
      suppress.current = true;
      window.setTimeout(() => { suppress.current = false; }, 0);
      setDrag(null);
      if (cancel) return;
      const over = slotAt(ev.clientX, ev.clientY);
      if (over && cb.current.canDrop(src, over)) cb.current.onDrop(src, over);
    };
    const up = (ev: PointerEvent) => finish(ev, false);
    const no = (ev: PointerEvent) => finish(ev, true);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', no);
  }, []);

  return { drag, start, suppressed: () => suppress.current };
}

export function DragGhost({ drag, label }: { drag: DragState | null; label: string }) {
  if (!drag || typeof document === 'undefined') return null;
  return createPortal(
    <div className={`vd-ed-ghost${drag.ok ? ' is-ok' : drag.over ? ' is-no' : ''}`} style={{ transform: `translate3d(${drag.x + 14}px, ${drag.y + 12}px, 0)` }} aria-hidden="true">
      <span className="vd-ed-ghost-fig"><Glyph w={drag.src.w} /></span>
      <span className="vd-ed-ghost-txt"><b>{drag.src.w.title || KIND_LABEL[drag.src.w.kind]}</b><small>{label}</small></span>
    </div>,
    document.body,
  );
}

/** 方向键找相邻格位：只看真正在那个方向上的格位，主方向距离 + 垂直方向偏移 × 0.6 最小者 */
export function neighborSlot(grid: HTMLElement | null, slot: string, key: string): string | null {
  if (!grid) return null;
  const cells = [...grid.querySelectorAll<HTMLElement>(':scope > [data-slot]')];
  const cur = cells.find(c => c.dataset.slot === slot);
  if (!cur) return null;
  const a = cur.getBoundingClientRect();
  const acx = a.left + a.width / 2, acy = a.top + a.height / 2;
  let best: string | null = null, score = Infinity;
  for (const c of cells) {
    if (c === cur) continue;
    const b = c.getBoundingClientRect();
    const bcx = b.left + b.width / 2, bcy = b.top + b.height / 2;
    let main: number, cross: number;
    if (key === 'ArrowRight') { if (b.left < a.right - 2) continue; main = b.left - a.right; cross = b.bottom > a.top && b.top < a.bottom ? 0 : Math.abs(bcy - acy); }
    else if (key === 'ArrowLeft') { if (b.right > a.left + 2) continue; main = a.left - b.right; cross = b.bottom > a.top && b.top < a.bottom ? 0 : Math.abs(bcy - acy); }
    else if (key === 'ArrowDown') { if (b.top < a.bottom - 2) continue; main = b.top - a.bottom; cross = b.right > a.left && b.left < a.right ? Math.abs(bcx - acx) * 0.2 : Math.abs(bcx - acx); }
    else if (key === 'ArrowUp') { if (b.bottom > a.top + 2) continue; main = a.top - b.bottom; cross = b.right > a.left && b.left < a.right ? Math.abs(bcx - acx) * 0.2 : Math.abs(bcx - acx); }
    else return null;
    const s = main + cross * 0.6 + Math.abs(key === 'ArrowLeft' || key === 'ArrowRight' ? bcy - acy : 0) * 0.15;
    if (s < score) { score = s; best = c.dataset.slot ?? null; }
  }
  return best;
}
