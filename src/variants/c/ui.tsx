import { Fragment, useLayoutEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from 'react';
import { ChartLine, Inbox, Table2 } from 'lucide-react';
import { useSite } from '../../core/provider';
import type { PaymentStatus } from '../../core/data/derive';
import { EASE, useEnter } from './lib';

/** 图标统一用 lucide，线宽 1.75，尺寸只用 16 / 20 */
export const ICON = { sm: 16, md: 20, stroke: 1.75 } as const;

/**
 * 遮罩逐行出现：每行外层 overflow:hidden，内层从下方滑入。
 * 静止态就是完整可见的文字；进入视口时用 Web Animations 从遮罩下方播上来。
 * 首屏标题用 fast：0–700ms 内全部到位。
 */
export function MaskText({ lines, as: Tag = 'span', className = '', delay = 0, stagger = 90, duration = 760, id }: {
  lines: ReactNode[];
  as?: ElementType;
  className?: string;
  delay?: number;
  stagger?: number;
  duration?: number;
  id?: string;
}) {
  const { fx } = useSite();
  const ref = useRef<HTMLElement>(null);
  useEnter(ref, el => Array.from(el.querySelectorAll<HTMLElement>('.vc-mask-in')).map((s, i) => s.animate(
    [{ transform: 'translateY(104%)' }, { transform: 'none' }],
    { duration, delay: delay + i * stagger, easing: EASE, fill: 'backwards' },
  )), { enabled: fx.motion });
  return (
    <Tag ref={ref} id={id} className={`vc-mask ${className}`}>
      {lines.map((l, i) => <span key={i} className="vc-mask-line"><span className="vc-mask-in">{l}</span></span>)}
    </Tag>
  );
}

/** 换内容时从下方滑入（key 变化触发重新挂载）。起点只低 40%，不会出现空白 */
export function Swap({ children, className = '' }: { children: ReactNode; className?: string }) {
  const { fx } = useSite();
  const ref = useRef<HTMLSpanElement>(null);
  useEnter(ref, el => [el.firstElementChild!.animate([{ transform: 'translateY(40%)', opacity: 0.2 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: EASE, fill: 'backwards' })], { enabled: fx.motion });
  return <span ref={ref} className={`vc-swap ${className}`}><span>{children}</span></span>;
}

export function Kicker({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`vc-kicker ${className}`}>{children}</p>;
}

/** 千分位逗号单独包一层，收紧字距（巨型数字用） */
export function Digits({ text }: { text: string }) {
  const parts = text.split(',');
  return <>{parts.map((p, i) => <Fragment key={i}>{i > 0 && <span className="vc-comma">,</span>}{p}</Fragment>)}</>;
}
/** 同上，给直接写 innerHTML 的计数器用（只含数字和逗号） */
export const digitsHtml = (text: string) => text.replace(/,/g, '<span class="vc-comma">,</span>');

/** 数字 + 单位：单位缩到 50%，基线对齐，间距 3px */
export function Num({ value, unit, className = '' }: { value: ReactNode; unit?: string; className?: string }) {
  return <span className={`vc-n ${className}`}><span className="vc-n-v">{value}</span>{unit && <span className="vc-n-u">{unit}</span>}</span>;
}

/**
 * 章节分隔：编号 + 一条描线 + 章节名 + 总进度。
 * 描线在进入视口时从左往右画出（scaleX），静止态是完整的线。
 */
export function ChapterRule({ no, total, title, className = '' }: { no: number; total: number; title: string; className?: string }) {
  const { fx } = useSite();
  const ref = useRef<HTMLDivElement>(null);
  useEnter(ref, el => {
    const line = el.querySelector('.vc-chapter-line i');
    const txt = el.querySelectorAll('.vc-chapter-name, .vc-chapter-of');
    const out: Animation[] = [];
    if (line) out.push(line.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 900, easing: EASE, fill: 'backwards' }));
    txt.forEach((t, i) => out.push(t.animate([{ opacity: 0.25, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 520, delay: 160 + i * 80, easing: EASE, fill: 'backwards' })));
    return out;
  }, { enabled: fx.motion });
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <div ref={ref} className={`vc-chapter ${className}`} aria-hidden="true">
      <span className="vc-chapter-no">{pad(no)}</span>
      <span className="vc-chapter-name">{title}</span>
      <span className="vc-chapter-line"><i /></span>
      <span className="vc-chapter-of">{pad(no)} / {pad(total)}</span>
    </div>
  );
}

export function Swatch({ color, kind = 'solid' }: { color: string; kind?: 'solid' | 'light' | 'outline' | 'line' | 'hatch' }) {
  return <i className={`vc-sw is-${kind}`} style={{ '--c': color } as CSSProperties} aria-hidden="true" />;
}

export function Legend({ items, className = '' }: { items: { label: string; color: string; kind?: 'solid' | 'light' | 'outline' | 'line' | 'hatch' }[]; className?: string }) {
  return (
    <ul className={`vc-legend ${className}`} aria-label="图例">
      {items.map(it => <li key={it.label}><Swatch color={it.color} kind={it.kind} />{it.label}</li>)}
    </ul>
  );
}

/** 付款状态：图标 + 文字，颜色只是辅助 */
export function StatusIcon({ status, size = 16 }: { status: PaymentStatus; size?: number }) {
  if (status === '已付清') return (
    <svg className="vc-st-ic is-paid" viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" /><path d="M5.2 8.2l1.9 1.9 3.8-4.1" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  if (status === '部分付款') return (
    <svg className="vc-st-ic is-part" viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <circle cx="8" cy="8" r="6" fill="none" strokeWidth="1.5" /><path d="M8 2a6 6 0 0 1 0 12z" />
    </svg>
  );
  return (
    <svg className="vc-st-ic is-none" viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <circle cx="8" cy="8" r="6" fill="none" strokeWidth="1.5" strokeDasharray="2.4 2" />
    </svg>
  );
}

export function StatusTag({ status }: { status: PaymentStatus }) {
  const cls = status === '已付清' ? 'is-paid' : status === '部分付款' ? 'is-part' : 'is-none';
  return <span className={`vc-status ${cls}`}><StatusIcon status={status} />{status}</span>;
}

/**
 * 图表提示框：浮层表面（描边 + 分层阴影）。
 * 放在相对定位的容器里，(x, y) 是锚点；量出自身尺寸后做边界避让：
 * 右侧放不下翻到左侧，上下不超出视口（避开导航和底部切换条）。
 */
export function Tip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const host = el?.offsetParent as HTMLElement | null;
    if (!el || !host) return;
    const w = el.offsetWidth, h = el.offsetHeight, gap = 16;
    const hr = host.getBoundingClientRect();
    const right = Math.min(width, window.innerWidth - hr.left) - 8;
    let l = x + gap;
    if (l + w > right) l = x - gap - w;
    l = Math.max(Math.max(-hr.left + 8, -8), l);
    let t = y - h / 2;
    const minT = 72 - hr.top, maxT = window.innerHeight - 104 - h - hr.top;
    t = Math.min(Math.max(t, minT), Math.max(minT, maxT));
    el.style.transform = `translate3d(${Math.round(l)}px, ${Math.round(t)}px, 0)`;
  });
  return <div ref={ref} className="vc-tip" role="status">{children}</div>;
}

/** 提示框里的一行：色块 + 名称 + 数值 */
export function TipRow({ color, kind = 'solid', label, value, on = false, total = false }: { color?: string; kind?: 'solid' | 'light' | 'line' | 'hatch' | 'outline'; label: ReactNode; value: ReactNode; on?: boolean; total?: boolean }) {
  return (
    <p className={`vc-tip-row ${on ? 'is-on' : ''} ${total ? 'is-total' : ''}`}>
      {color ? <Swatch color={color} kind={kind} /> : <i className="vc-tip-gap" aria-hidden="true" />}
      <span>{label}</span><b>{value}</b>
    </p>
  );
}

export interface TableCol<T> { key: string; label: string; num?: boolean; render: (row: T) => ReactNode }

export function DataTable<T>({ cols, rows, caption, rowKey }: { cols: TableCol<T>[]; rows: T[]; caption: string; rowKey: (r: T) => string }) {
  return (
    <div className="vc-dtable" tabIndex={0} role="region" aria-label={caption}>
      <table>
        <caption className="vc-sr">{caption}</caption>
        <thead><tr>{cols.map(c => <th key={c.key} scope="col" className={c.num ? 'is-num' : ''}>{c.label}</th>)}</tr></thead>
        <tbody>{rows.map(r => <tr key={rowKey(r)}>{cols.map(c => <td key={c.key} className={c.num ? 'is-num' : ''}>{c.render(r)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

/**
 * 图表外框：标题 + 图例 + 「图表 / 数据表」切换 + 旁注栏。
 * 旁注是编辑式注释：带编号，图里对应位置有同号标记。
 */
export function ChartFrame({ kicker, title, legend, table, notes, children, className = '', id }: {
  kicker?: string;
  title: string;
  legend?: ReactNode;
  table?: ReactNode;
  notes?: ReactNode[];
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <section className={`vc-frame ${notes?.length ? 'has-notes' : ''} ${className}`} aria-labelledby={id}>
      <header className="vc-frame-head">
        <div>
          {kicker && <p className="vc-kicker">{kicker}</p>}
          <h2 id={id} className="vc-frame-title">{title}</h2>
        </div>
        <div className="vc-frame-tools">
          {legend}
          {table && (
            <div className="vc-seg" role="group" aria-label="显示方式">
              <button type="button" aria-pressed={view === 'chart'} onClick={() => setView('chart')}><ChartLine size={ICON.sm} strokeWidth={ICON.stroke} aria-hidden="true" />图表</button>
              <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}><Table2 size={ICON.sm} strokeWidth={ICON.stroke} aria-hidden="true" />数据表</button>
            </div>
          )}
        </div>
      </header>
      <div className="vc-frame-body">
        <div className="vc-frame-main">{view === 'chart' || !table ? children : table}</div>
        {notes && notes.length > 0 && (
          <ol className="vc-notes" aria-label="注释">
            {notes.map((n, i) => <li key={i}><span className="vc-note-no" aria-hidden="true">{i + 1}</span><p>{n}</p></li>)}
          </ol>
        )}
      </div>
    </section>
  );
}

/** 空状态：一枚轨道小图 + 标题 + 说明，可带一个操作 */
export function Empty({ title = '当前筛选下没有数据', hint = '换一个型号或期间试试，或者清除筛选。', action }: { title?: string; hint?: string; action?: ReactNode; children?: ReactNode }) {
  return (
    <div className="vc-empty" role="status">
      <span className="vc-empty-ic" aria-hidden="true"><Inbox size={ICON.md} strokeWidth={ICON.stroke} /></span>
      <p className="vc-empty-t">{title}</p>
      <p className="vc-empty-h">{hint}</p>
      {action}
    </div>
  );
}

/** 图表还没量出尺寸时的占位：发丝网格 + 一道扫光 */
export function ChartSkeleton({ height }: { height: number }) {
  return <div className="vc-skel" style={{ height }} aria-hidden="true"><i /><i /><i /><i /></div>;
}
