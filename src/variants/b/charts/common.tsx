import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { ChartLineIcon, TableIcon } from '@phosphor-icons/react';

/* ───────── 提示框 ───────── */

export function Tip({ x, y, width, children, below = false }: { x: number; y: number; width: number; children: ReactNode; below?: boolean }) {
  const half = 84;
  const left = width > half * 2 ? Math.max(half, Math.min(width - half, x)) : width / 2;
  return (
    <div className={`vb-tip${below ? ' is-below' : ''}`} style={{ left, top: y }} role="status" aria-live="polite">
      {children}
    </div>
  );
}

export function TipRow({ color, label, value, kind = 'dot' }: { color?: string; label: ReactNode; value: ReactNode; kind?: 'dot' | 'line' }) {
  return (
    <div className="vb-tip-row">
      {color && <i className={`vb-sw is-${kind}`} style={{ background: color }} aria-hidden="true" />}
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

/* ───────── 图例 ───────── */

export interface LegendItem { label: string; color: string; kind?: 'line' | 'bar' | 'dot' | 'ring' | 'dash' }

export function Legend({ items }: { items: LegendItem[] }) {
  if (items.length < 2) return null;
  return (
    <ul className="vb-legend" aria-label="图例">
      {items.map(it => (
        <li key={it.label}><i className={`vb-sw is-${it.kind ?? 'dot'}`} style={{ background: it.kind === 'ring' ? 'transparent' : it.color, borderColor: it.color }} aria-hidden="true" />{it.label}</li>
      ))}
    </ul>
  );
}

/* ───────── 数据表 ───────── */

export interface Column { key: string; label: string; num?: boolean }

export function DataTable({ caption, columns, rows }: { caption: string; columns: Column[]; rows: Record<string, ReactNode>[] }) {
  return (
    <div className="vb-dtable-wrap">
      <table className="vb-dtable">
        <caption>{caption}</caption>
        <thead><tr>{columns.map(c => <th key={c.key} scope="col" className={c.num ? 'is-num' : undefined}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{columns.map((c, j) => j === 0 ? <th key={c.key} scope="row">{r[c.key]}</th> : <td key={c.key} className={c.num ? 'is-num' : undefined}>{r[c.key]}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ───────── 图表卡片 ───────── */

/**
 * 图表外框：标题、一句话洞察、图例、「图 / 表」切换。
 * flash=true 时边框亮起（看板「本页要点」点击后的定位反馈）。
 */
export function ChartCard({ id, title, note, legend, table, children, className = '', flash = false, eyebrow, actions }: {
  id?: string;
  title: string;
  note?: ReactNode;
  legend?: LegendItem[];
  table?: ReactNode;
  children: ReactNode;
  className?: string;
  flash?: boolean;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  const ref = useRef<HTMLElement>(null);
  return (
    <section ref={ref} id={id} className={`vb-card vb-chart-card ${className}${flash ? ' is-flash' : ''}`} aria-labelledby={id ? `${id}-t` : undefined}>
      <header className="vb-card-head">
        <div className="vb-card-titles">
          {eyebrow && <span className="vb-eyebrow">{eyebrow}</span>}
          <h3 id={id ? `${id}-t` : undefined}>{title}</h3>
          {note && <p className="vb-card-note">{note}</p>}
        </div>
        <div className="vb-card-tools">
          {actions}
          {table && (
            <div className="vb-seg" role="group" aria-label="显示方式">
              <button type="button" aria-pressed={!showTable} onClick={() => setShowTable(false)} title="图"><ChartLineIcon size={15} aria-hidden="true" /><span>图</span></button>
              <button type="button" aria-pressed={showTable} onClick={() => setShowTable(true)} title="查看数据表"><TableIcon size={15} aria-hidden="true" /><span>数据表</span></button>
            </div>
          )}
        </div>
      </header>
      {legend && !showTable && <Legend items={legend} />}
      <div className="vb-card-body">{showTable && table ? table : children}</div>
    </section>
  );
}

/* ───────── 键盘浏览图表 ───────── */

/** 方向键在 n 个数据项之间移动，Esc 清除 */
export function useKeyNav(n: number, index: number | null, set: (i: number | null) => void) {
  return (e: KeyboardEvent) => {
    if (!n) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); set(index === null ? 0 : (index + 1) % n); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); set(index === null ? n - 1 : (index - 1 + n) % n); }
    else if (e.key === 'Escape') set(null);
  };
}

/** 触控设备点在图外时清除悬停 */
export function useOutsideClear(ref: RefObject<HTMLElement | null>, active: boolean, clear: () => void) {
  useEffect(() => {
    if (!active) return;
    const on = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) clear(); };
    document.addEventListener('pointerdown', on);
    return () => document.removeEventListener('pointerdown', on);
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
}
