import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { ChartArea, Table2 } from 'lucide-react';
import { Legend, type LegendItem } from '../lib';

/** 图表提示框：在图表容器（position:relative）内定位，靠右时自动翻到左侧 */
export function Tip({ x, y, width, height, children }: { x: number; y: number; width: number; height?: number; children: ReactNode }) {
  const flip = x > width * 0.58;
  const top = height ? Math.max(12, Math.min(height - 12, y)) : y;
  const style: CSSProperties = { left: x, top, transform: flip ? 'translate(calc(-100% - 14px), -50%)' : 'translate(14px, -50%)' };
  return <div className="va-tip" style={style} role="status" aria-live="polite">{children}</div>;
}

export function TipRow({ color, label, value, strong }: { color?: string; label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className={`va-tip-row${strong ? ' is-strong' : ''}`}>
      {color ? <i style={{ background: color }} aria-hidden="true" /> : <i className="is-empty" aria-hidden="true" />}
      <span>{label}</span>
      <b className="va-num">{value}</b>
    </div>
  );
}

export interface Column<R> { key: string; label: string; align?: 'left' | 'right'; render: (row: R) => ReactNode }

export function DataTable<R>({ caption, columns, rows, rowKey }: { caption: string; columns: Column<R>[]; rows: R[]; rowKey: (r: R) => string }) {
  return (
    <div className="va-dtable-wrap">
      <table className="va-dtable">
        <caption className="va-sr">{caption}</caption>
        <thead>
          <tr>{columns.map(c => <th key={c.key} scope="col" className={c.align === 'right' ? 'is-num' : ''}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={rowKey(r)}>
              {columns.map(c => <td key={c.key} data-label={c.label} className={c.align === 'right' ? 'is-num va-num' : ''}>{c.render(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 图表卡片：标题、等宽代号、图例；传入 table 时提供「图表 / 数据表」切换。
 * 卡片带 data-spot，放在 .va-spotlit 容器里时共用聚光灯边框。
 */
export function ChartCard({ code, title, desc, legend, table, children, className = '', aside }: {
  code: string;
  title: string;
  desc?: ReactNode;
  legend?: LegendItem[];
  table?: ReactNode;
  children: ReactNode;
  className?: string;
  aside?: ReactNode;
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const id = useId();
  return (
    <section className={`va-card va-spot va-chartcard ${className}`} data-spot aria-labelledby={id}>
      <header className="va-card-head">
        <div className="va-card-title">
          <p className="va-mono">{code}</p>
          <h3 id={id}>{title}</h3>
          {desc ? <p className="va-card-desc">{desc}</p> : null}
        </div>
        <div className="va-card-tools">
          {aside}
          {table ? (
            <div className="va-seg" role="group" aria-label={`${title}的显示方式`}>
              <button type="button" aria-pressed={view === 'chart'} onClick={() => setView('chart')}><ChartArea size={14} aria-hidden="true" />图表</button>
              <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}><Table2 size={14} aria-hidden="true" />数据表</button>
            </div>
          ) : null}
        </div>
      </header>
      {legend && view === 'chart' ? <Legend items={legend} /> : null}
      <div className="va-card-body">{view === 'chart' || !table ? children : table}</div>
    </section>
  );
}
