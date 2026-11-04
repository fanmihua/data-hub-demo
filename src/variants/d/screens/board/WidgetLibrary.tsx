import type { CSSProperties, PointerEvent as RPointerEvent } from 'react';
import { WIDGET_LIBRARY } from '../../model/editor';
import type { WidgetConfig } from '../../model/types';
import { IconLayers } from '../../ui/icons';
import { Glyph } from './glyphs';
import { KIND_LABEL, TYPE_LABEL } from './lib';

/**
 * 组件库（编辑状态左侧抽屉）：拖到空位放进去；也可以点选，放进当前选中的空位（没选就放进第一个空位）。
 * 没有空位时整组变灰并提示先删除一个组件。
 */
export function WidgetLibrary({ target, emptyCount, onPick, onDragStart, suppressed }: {
  target: string | null;
  emptyCount: number;
  onPick: (w: WidgetConfig) => void;
  onDragStart: (e: RPointerEvent<HTMLElement>, w: WidgetConfig) => void;
  suppressed: () => boolean;
}) {
  const hint = target
    ? <>点一个组件，放进 <b className="vd-mono">{target.toUpperCase()}</b></>
    : emptyCount
      ? <>拖到空位，或点选放进第一个空位</>
      : <>没有空位：先删除一个组件</>;
  return (
    <aside className={`vd-ed-lib${emptyCount ? '' : ' is-full'}`} aria-label="组件库">
      <header className="vd-ed-side-head">
        <p className="vd-kicker"><IconLayers />LIBRARY · {String(WIDGET_LIBRARY.length).padStart(2, '0')}</p>
        <h2>组件库</h2>
        <p className="vd-ed-side-hint" aria-live="polite">{hint}</p>
      </header>
      <ul className="vd-ed-lib-list">
        {WIDGET_LIBRARY.map((w, i) => {
          const [kindName, detail] = w.title.includes(' · ') ? w.title.split(' · ') : [w.title, null];
          return (
            <li key={w.id} style={{ '--i': i } as CSSProperties}>
              <button type="button" className="vd-ed-lib-item" aria-disabled={!emptyCount || undefined}
                aria-label={`${w.title}（${KIND_LABEL[w.kind]}）${emptyCount ? '，放进空位' : '，现在没有空位'}`}
                onPointerDown={e => { if (emptyCount) onDragStart(e, w); }}
                onClick={() => { if (!suppressed()) onPick(w); }}>
                <span className="vd-ed-lib-fig"><Glyph w={w} /></span>
                <span className="vd-ed-lib-txt">
                  <b>{kindName}</b>
                  <small>{detail ?? KIND_LABEL[w.kind]}{w.chartType && w.kind === 'timeseries' ? ` · ${TYPE_LABEL[w.chartType]}` : ''}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
