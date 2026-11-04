import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import { useDerived, useSite } from '../../../../core/provider';
import type { BillRow } from '../../../../core/data/derive';
import type { Route } from '../../../../core/route';
import { BOARD_LAYOUTS } from '../../model/boards';
import { editReducer } from '../../model/editor';
import { tickerEvents } from '../../model/events';
import { METRICS } from '../../model/metrics';
import type { BoardId, BoardLayout, WidgetConfig } from '../../model/types';
import { Shell } from '../../shell/Shell';
import { Orb } from '../../ui/Orb';
import { Ticker } from '../../ui/Ticker';
import { IconCheck, IconEdit, IconExitFullscreen, IconFullscreen, IconReplay, IconUndo } from '../../ui/icons';
import { modelColorVar } from '../../viz';
import { ChainPopover } from './ChainPopover';
import { ConfigDrawer } from './ConfigDrawer';
import { CellChrome, DragGhost, EmptySlot, GridGuides, neighborSlot, useEditDrag, type DragSrc } from './EditLayer';
import { IconChevronDown, IconKeyboard, IconPeriod, IconSwap } from './icons';
import { BoardCtx, KIND_LABEL, type BoardCtxValue } from './lib';
import { Widget } from './Widget';
import { WidgetLibrary } from './WidgetLibrary';

/** 「完成」后的布局留在内存里（这次浏览内有效，刷新后回到默认） */
const memory = new Map<BoardId, BoardLayout>();

const STAGGER = 120;
const placedTitle = (tpl: WidgetConfig) => (tpl.title.includes(' · ') ? tpl.title.split(' · ')[1] : tpl.metric ? METRICS[tpl.metric].label : tpl.title);

/**
 * 看板驾驶舱（规范第 4.6 节）：
 * - 顶部：标题（刚生成标记）、型号 / 期间筛选、消息条、重播动画 / 编辑 / 全屏；
 * - 网格：布局里的 grid-template-areas，组件由 Widget 按配置渲染；
 * - 中央地球：点卫星筛到这个型号（整屏联动），再点一次取消；地球上叠巨型完成率；
 * - 底部时间线：点一张报账单弹出付款链路浮层；
 * - ?generated=1：组件按顺序拼装入场（地球先到），标题旁显示「刚生成」；
 * - 编辑状态（规范第 4.7 节第 2 条）：网格线浮现，拖拽 / 方向键交换、删除、从组件库放回、配置抽屉改标题指标颜色类型。
 */
export function Cockpit({ id, route }: { id: BoardId; route: Route }) {
  const { data, fx } = useSite();
  const base = BOARD_LAYOUTS[id];
  const [layout, dispatch] = useReducer(editReducer, base, b => memory.get(id) ?? b);
  const [editing, setEditing] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [period, setPeriod] = useState('all');
  const filter = useMemo(() => ({ models, period }), [models, period]);
  const d = useDerived(filter);
  const generated = route.query.get('generated') === '1';
  const [play, setPlay] = useState(0);
  const [assembling, setAssembling] = useState(() => generated && fx.motion);
  const [built, setBuilt] = useState(0);
  const [chain, setChain] = useState<{ bill: BillRow; anchor: DOMRect } | null>(null);
  const chainTrigger = useRef<HTMLElement | SVGElement | null>(null);
  const [immersive, setImmersive] = useState(false);
  const [say, setSay] = useState('');
  const [fresh, setFresh] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string | null>(null);

  const modelIds = data.models.map(m => m.id);
  const modelKey = modelIds.join('|');
  const name = data.assets.find(a => a.id === id)?.name ?? base.title;
  const slots = Object.keys(layout.slots);
  const order = useMemo(() => {
    const g = slots.filter(s => layout.slots[s]?.kind === 'globe');
    return [...g, ...slots.filter(s => !g.includes(s))];
  }, [layout]); // eslint-disable-line react-hooks/exhaustive-deps
  const changed = Object.keys(base.slots).filter(s => JSON.stringify(base.slots[s]) !== JSON.stringify(layout.slots[s])).length;
  const emptySlots = slots.filter(s => !layout.slots[s]);

  /* ── 筛选 ── */
  const selectModel = useCallback((m: string | null) => {
    setModels(m ? [m] : []);
    setChain(null);
    setSay(m ? `已筛选到 ${m}，整屏数字随之更新` : '已取消型号筛选');
  }, []);
  useEffect(() => { setModels(ms => (ms.some(m => !modelKey.split('|').includes(m)) ? [] : ms)); }, [modelKey]);
  useEffect(() => { if (!d.options.periods.some(p => p.value === period)) setPeriod('all'); }, [d.options.periods, period]);
  useEffect(() => { setChain(null); }, [period]);

  /* ── 拼装入场 / 重播 ── */
  useEffect(() => {
    if (!assembling) { setBuilt(order.length); return; }
    setBuilt(0);
    const t0 = performance.now();
    const iv = window.setInterval(() => setBuilt(Math.min(order.length, Math.floor((performance.now() - t0 - 160) / STAGGER) + 1)), 60);
    const done = window.setTimeout(() => setAssembling(false), 160 + order.length * STAGGER + 900);
    return () => { clearInterval(iv); clearTimeout(done); };
  }, [assembling, play]); // eslint-disable-line react-hooks/exhaustive-deps
  const replay = () => {
    setChain(null);
    setPlay(p => p + 1);
    if (fx.motion) setAssembling(true);
    setSay('正在重播入场动画');
  };

  /* ── 付款链路 ── */
  const openBill = useCallback<BoardCtxValue['openBill']>((bill, anchor, trigger) => {
    chainTrigger.current = trigger ?? null;
    setChain(c => (c && c.bill.id === bill.id ? null : { bill, anchor }));
  }, []);
  const closeChain = useCallback((restore: boolean) => {
    setChain(null);
    const t = chainTrigger.current;
    chainTrigger.current = null;
    if (restore && t && 'focus' in t) window.setTimeout(() => { if (t.isConnected) (t as HTMLElement).focus({ preventScroll: true }); }, 0);
  }, []);
  const ctx = useMemo<BoardCtxValue>(() => ({ openBill, activeBill: chain?.bill.id ?? null, editing }), [openBill, chain, editing]);

  /* ── 全屏：整页进入浏览器全屏，同时隐藏外壳的左栏和顶栏（浏览器不让全屏时只做后者） ── */
  const toggleFull = () => {
    if (!immersive) {
      setImmersive(true);
      const el = document.documentElement;
      if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().catch(() => {});
    } else {
      setImmersive(false);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }
  };
  useEffect(() => {
    const on = () => { if (!document.fullscreenElement) setImmersive(false); };
    document.addEventListener('fullscreenchange', on);
    return () => {
      document.removeEventListener('fullscreenchange', on);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!immersive) return;
    const on = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented && !document.fullscreenElement) setImmersive(false); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [immersive]);

  /* ── FLIP：交换、还原、进出编辑时，组件从旧位置滑到新位置（只位移不缩放） ── */
  const cellEls = useRef(new Map<string, HTMLElement>());
  const flipFrom = useRef<Map<string, DOMRect> | null>(null);
  const captureFlip = () => {
    if (!fx.motion) return;
    const m = new Map<string, DOMRect>();
    cellEls.current.forEach((el, k) => m.set(k, el.getBoundingClientRect()));
    flipFrom.current = m;
  };
  useLayoutEffect(() => {
    const from = flipFrom.current;
    flipFrom.current = null;
    if (from) {
      cellEls.current.forEach((el, k) => {
        const a = from.get(k);
        if (!a) return;
        const b = el.getBoundingClientRect();
        if (!b.width || !b.height) return;
        // 只做位移（以中心对齐）+ 淡入，不做缩放：图表、地球用 getBoundingClientRect 量尺寸，缩放中的量法会让它们按错误尺寸绘制
        const dx = a.left + a.width / 2 - (b.left + b.width / 2), dy = a.top + a.height / 2 - (b.top + b.height / 2);
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        el.animate(
          [{ transform: `translate(${dx}px, ${dy}px)`, opacity: a.width !== b.width || a.height !== b.height ? 0.55 : 1 }, { transform: 'none', opacity: 1 }],
          { duration: 460, easing: 'cubic-bezier(.16, 1, .3, 1)' },
        );
      });
    }
    if (pendingFocus.current) {
      grid.current?.querySelector<HTMLElement>(`:scope > [data-slot="${pendingFocus.current}"]`)?.focus({ preventScroll: true });
      pendingFocus.current = null;
    }
  }, [layout, editing]);
  useEffect(() => {
    if (!fresh) return;
    const t = window.setTimeout(() => setFresh(null), 900);
    return () => clearTimeout(t);
  }, [fresh]);

  /* ── 编辑操作 ── */
  const title = (w: WidgetConfig | null | undefined) => (w ? w.title || KIND_LABEL[w.kind] : '');
  const swap = (a: string, b: string) => {
    const wa = layout.slots[a], wb = layout.slots[b];
    if (!wa && !wb) return;
    captureFlip();
    dispatch({ type: 'swap', a, b });
    setSel(s => (s === a ? b : s === b ? a : s));
    setSay(wa && wb ? `已交换「${title(wa)}」和「${title(wb)}」` : `已把「${title(wa ?? wb)}」移到 ${(wa ? b : a).toUpperCase()}`);
  };
  const remove = (slot: string) => {
    const w = layout.slots[slot];
    if (!w) return;
    dispatch({ type: 'remove', slot });
    setSel(slot);
    pendingFocus.current = slot;
    setSay(`已删除「${title(w)}」，${slot.toUpperCase()} 空出来了`);
  };
  const add = (slot: string, tpl: WidgetConfig) => {
    if (layout.slots[slot]) return;
    dispatch({ type: 'add', slot, widget: { ...tpl, title: placedTitle(tpl) } });
    setSel(slot);
    setFresh(slot);
    pendingFocus.current = slot;
    setSay(`已把「${placedTitle(tpl)}」放进 ${slot.toUpperCase()}`);
  };
  const pick = (tpl: WidgetConfig) => {
    const target = sel && !layout.slots[sel] ? sel : emptySlots[0];
    if (!target) { setSay('没有空位：先删除一个组件，再从组件库放进来'); return; }
    add(target, tpl);
  };
  const update = (slot: string, patch: Partial<WidgetConfig>) => dispatch({ type: 'update', slot, patch });
  const restore = () => {
    captureFlip();
    dispatch({ type: 'reset', layout: base });
    setSel(null);
    setSay('已还原成默认布局');
  };
  const startEdit = (target?: string) => {
    captureFlip();
    setChain(null);
    setEditing(true);
    setSel(target ?? null);
    setSay('进入编辑：拖动组件交换位置，选中后可用方向键交换，Delete 删除');
  };
  const finish = () => {
    captureFlip();
    if (layout === base) memory.delete(id); else memory.set(id, layout);
    setEditing(false);
    setSel(null);
    setSay(changed ? `已保存 ${changed} 处改动（这次浏览内有效）` : '已退出编辑');
  };

  const { drag, start, suppressed } = useEditDrag({
    canDrop: (src: DragSrc, slot: string) => (src.type === 'cell' ? slot !== src.slot && slot in layout.slots : slot in layout.slots && !layout.slots[slot]),
    onDrop: (src: DragSrc, slot: string) => { if (src.type === 'cell') swap(src.slot, slot); else add(slot, src.w); },
  });
  const ghostLabel = (() => {
    if (!drag) return '';
    if (!drag.over) return drag.src.type === 'lib' ? '拖到一个空位' : '拖到另一个格位';
    const at = drag.over.toUpperCase();
    if (drag.src.type === 'lib') return drag.ok ? `放进 ${at}` : `${at} 已有组件`;
    if (!drag.ok) return '原来的位置';
    const other = layout.slots[drag.over];
    return other ? `与「${title(other)}」交换` : `移到空位 ${at}`;
  })();

  const onCellKey = (e: KeyboardEvent<HTMLDivElement>, slot: string) => {
    if (e.target !== e.currentTarget) return;
    const w = layout.slots[slot];
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setSel(s => (s === slot ? null : slot));
      if (!w) document.querySelector<HTMLElement>('.vd-ed-lib-item')?.focus();
      return;
    }
    if (e.key === 'Escape') { if (sel) { e.preventDefault(); setSel(null); } return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && w) { e.preventDefault(); remove(slot); return; }
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const nb = neighborSlot(grid.current, slot, e.key);
      if (!nb) return;
      if (sel === slot && (w || layout.slots[nb])) { pendingFocus.current = nb; swap(slot, nb); }
      else grid.current?.querySelector<HTMLElement>(`:scope > [data-slot="${nb}"]`)?.focus();
    }
  };
  const onCellClick = (e: MouseEvent, slot: string) => {
    if (!editing) { if (!layout.slots[slot]) startEdit(slot); return; }
    if (suppressed()) return;
    e.stopPropagation();
    setSel(s => (s === slot ? null : slot));
  };
  const onEmptyKey = (e: KeyboardEvent<HTMLDivElement>, slot: string) => {
    if (editing) { onCellKey(e, slot); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startEdit(slot); }
  };
  const dragSlot = drag && drag.src.type === 'cell' ? drag.src.slot : null;

  const gridStyle: CSSProperties = {
    gridTemplateColumns: layout.columns,
    gridTemplateRows: layout.rows,
    gridTemplateAreas: layout.areas.map(a => `"${a}"`).join(' '),
  };
  const crumbs = editing ? ['看板', name, '编辑'] : ['看板', name];
  const events = useMemo(() => tickerEvents(d), [d]);

  return (
    <Shell route={route} crumbs={crumbs}>
      <BoardCtx.Provider value={ctx}>
        <div className={`vd-screen vd-bd${editing ? ' is-editing' : ''}${assembling ? ' is-assembling' : ''}${immersive ? ' is-immersive' : ''}${drag ? ' is-dragging' : ''}`}
          data-board={id}>
          {editing ? (
            <header className="vd-bd-head is-edit">
              <div className="vd-bd-titles">
                <p className="vd-kicker">EDIT · {id.toUpperCase()} · {slots.length} SLOTS</p>
                <h1 className="vd-bd-title">{name}<span className="vd-bd-badge is-edit"><i aria-hidden="true" />编辑中</span></h1>
              </div>
              <p className="vd-ed-hint">
                <span><IconSwap />拖动交换位置</span>
                <span><IconKeyboard />选中后方向键交换</span>
                <span><kbd>Delete</kbd>删除</span>
              </p>
              <div className="vd-bd-actions">
                <span className={`vd-ed-count${changed ? ' is-on' : ''}`} aria-live="polite">{changed ? `已改 ${changed} 处` : '未修改'}</span>
                <button type="button" className="vd-btn" onClick={restore} disabled={layout === base}><IconUndo />还原</button>
                <button type="button" className="vd-btn is-primary" onClick={finish}><IconCheck />完成</button>
              </div>
            </header>
          ) : (
            <header className="vd-bd-head">
              <div className="vd-bd-titles">
                <p className="vd-kicker">BOARD · {id.toUpperCase()}{layout !== base ? ' · 已调整布局' : ''}</p>
                <h1 className="vd-bd-title" title={base.subtitle}>
                  {name}
                  {generated && (
                    <span className={`vd-bd-badge is-new${assembling ? ' is-busy' : ''}`} role="status">
                      <Orb state={assembling ? 'thinking' : 'idle'} size={14} />
                      {assembling ? `拼装中 ${Math.max(0, built)}/${order.length}` : '刚生成'}
                    </span>
                  )}
                </h1>
              </div>
              <div className="vd-bd-filters" role="group" aria-label="筛选">
                <div className="vd-seg vd-bd-seg" role="group" aria-label="型号">
                  <button type="button" aria-pressed={!models.length} onClick={() => selectModel(null)}>全部</button>
                  {modelIds.map((m, i) => (
                    <button key={m} type="button" aria-pressed={models[0] === m} onClick={() => selectModel(models[0] === m ? null : m)}>
                      <i style={{ background: modelColorVar(i) }} aria-hidden="true" />{m}
                    </button>
                  ))}
                </div>
                <label className="vd-bd-select">
                  <IconPeriod />
                  <span className="vd-sr">期间</span>
                  <select value={period} onChange={e => setPeriod(e.target.value)}>
                    {d.options.periods.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                  <IconChevronDown className="vd-bd-select-caret" />
                </label>
              </div>
              <div className="vd-bd-ticker"><Ticker events={events} /></div>
              <div className="vd-bd-actions">
                <button type="button" className="vd-btn is-ghost" onClick={replay} title="把数字滚轮和入场动画再播一遍"><IconReplay />重播动画</button>
                <button type="button" className="vd-btn" onClick={() => startEdit()}><IconEdit />编辑</button>
                <button type="button" className="vd-icon-btn vd-bd-full" onClick={toggleFull} aria-pressed={immersive}
                  aria-label={immersive ? '退出全屏' : '全屏'} data-tip={immersive ? '退出全屏' : '全屏'}>
                  {immersive ? <IconExitFullscreen /> : <IconFullscreen />}
                </button>
              </div>
            </header>
          )}

          <div className="vd-bd-body">
            {editing && (
              <WidgetLibrary target={sel && !layout.slots[sel] ? sel : null} emptyCount={emptySlots.length}
                onPick={pick} suppressed={suppressed}
                onDragStart={(e, w) => start(e, { type: 'lib', w })} />
            )}
            <div className="vd-bd-stage" onClick={() => { if (editing && !suppressed()) setSel(null); }}>
              <GridGuides layout={layout} style={gridStyle} />
              <div ref={grid} className="vd-bd-grid" style={gridStyle}>
                {slots.map(slot => {
                  const w = layout.slots[slot];
                  const i = order.indexOf(slot);
                  const on = editing && sel === slot;
                  const over = drag?.over === slot;
                  const cls = `vd-bd-cell${w ? '' : ' is-empty'}${on ? ' is-selected' : ''}${over ? (drag?.ok ? ' is-drop' : ' is-nodrop') : ''}${dragSlot === slot ? ' is-source' : ''}${fresh === slot ? ' is-fresh' : ''}`;
                  const common = {
                    'data-slot': slot,
                    'data-kind': w?.kind ?? 'empty',
                    className: cls,
                    style: { gridArea: slot, '--i': i } as CSSProperties,
                    onClick: (e: MouseEvent) => onCellClick(e, slot),
                  };
                  if (!w) {
                    return (
                      <div key={`empty:${slot}`} {...common} role="button" tabIndex={0}
                        aria-label={`空位 ${slot.toUpperCase()}：添加组件${editing ? '。按 Enter 选中后从组件库挑一个' : '（会进入编辑状态）'}`}
                        onKeyDown={e => onEmptyKey(e, slot)}>
                        <EmptySlot slot={slot} targeted={on || over} hint={editing ? (over ? '松手放进来' : '从组件库放一个进来') : '点击进入编辑'} />
                      </div>
                    );
                  }
                  return (
                    <div key={w.id} {...common}
                      ref={el => { if (el) cellEls.current.set(w.id, el); else cellEls.current.delete(w.id); }}
                      tabIndex={editing ? 0 : undefined}
                      role={editing ? 'button' : undefined}
                      aria-pressed={editing ? on : undefined}
                      aria-label={editing ? `${title(w)}（${KIND_LABEL[w.kind]}，格位 ${slot.toUpperCase()}）。Enter 选中，选中后方向键交换，Delete 删除` : undefined}
                      onPointerDown={editing ? e => start(e, { type: 'cell', slot, w }) : undefined}
                      onKeyDown={editing ? e => onCellKey(e, slot) : undefined}>
                      <div className="vd-bd-cell-in" key={`${w.id}:${play}`} inert={editing || undefined}>
                        <Widget config={w} filter={filter} onSelectModel={selectModel} />
                      </div>
                      {editing && <CellChrome slot={slot} w={w} onRemove={() => remove(slot)} />}
                    </div>
                  );
                })}
              </div>
              {assembling && <span className="vd-bd-scan" aria-hidden="true" />}
            </div>
            {editing && (
              <ConfigDrawer layout={layout} slot={sel} onSelect={setSel} onUpdate={update}
                onRemove={slot => { remove(slot); }} />
            )}
          </div>

          {chain && !editing && <ChainPopover bill={chain.bill} anchor={chain.anchor} onClose={closeChain} />}
          <DragGhost drag={drag} label={ghostLabel} />
          <p className="vd-sr" role="status" aria-live="polite">{say}</p>
        </div>
      </BoardCtx.Provider>
    </Shell>
  );
}
