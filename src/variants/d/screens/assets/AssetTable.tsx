import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { dayLabel, int } from '../../../../core/data/format';
import type { CatalogItem } from '../../model/types';
import { Sparkline } from '../../ui/Sparkline';
import { IconBoard, IconClock, IconMetric, IconTable } from '../../ui/icons';
import { GROUP_LABEL, recordUnit, splitHits, type Group } from './lib';

/**
 * 资产表格与卡片视图。
 * - 按类型分组（看板 / 数据表 / 指标 / 筹备中），组头是等宽小字；
 * - 行悬停整行变浅底；选中行主色淡底 + 左侧主色竖条，迷你趋势线转成主色并带呼吸点；
 * - 键盘：↑ / ↓ 在可用行之间移动选中，Home / End 到首尾；筹备中的行灰显、不能选；
 * - 名称和说明里命中搜索词的部分高亮。
 */
export interface AssetRow { item: CatalogItem; group: Group; code: string; short: string }
export interface RowGroup { id: Group; label: string; en: string; rows: AssetRow[] }
export type SortKey = 'name' | 'updated' | 'records';
export interface Sort { key: SortKey | null; dir: 1 | -1 }

export const GLYPH = { board: IconBoard, table: IconTable, metric: IconMetric, planned: IconClock } as const;

export function Hit({ text, q }: { text: string; q: string }) {
  return <>{splitHits(text, q).map((p, i) => (p.hit ? <mark key={i} className="vd-as-hit">{p.s}</mark> : <span key={i}>{p.s}</span>))}</>;
}

const shortDate = (s: string) => (/^\d{4}-\d{2}-\d{2}/.test(s) ? dayLabel(s) : s);
const timeOf = (s: string) => (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s) ? s.slice(11, 16) : '');

/** 选中行移动：返回下一个可选行的 id */
function step(flat: AssetRow[], current: string | null, key: string) {
  const ids = flat.filter(r => r.group !== 'planned').map(r => r.item.id);
  if (!ids.length) return null;
  const i = current ? ids.indexOf(current) : -1;
  if (key === 'ArrowDown') return ids[Math.min(ids.length - 1, i + 1)];
  if (key === 'ArrowUp') return ids[Math.max(0, i - 1)];
  if (key === 'Home') return ids[0];
  if (key === 'End') return ids[ids.length - 1];
  return null;
}

function useRowFocus(root: RefObject<HTMLElement | null>, current: string | null) {
  const want = useRef(false);
  useEffect(() => {
    if (!want.current || !current) return;
    want.current = false;
    root.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(current)}"]`)?.focus({ preventScroll: true });
  }, [current, root]);
  return want;
}

function SortHead({ k, sort, onSort, children, className }: { k: SortKey; sort: Sort; onSort: (k: SortKey) => void; children: ReactNode; className: string }) {
  const on = sort.key === k;
  return (
    <th scope="col" className={className} aria-sort={on ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
      <button type="button" className={`vd-as-sort${on ? ' is-on' : ''}`} onClick={() => onSort(k)}>
        {children}
        <span className={`vd-as-sort-ic${on && sort.dir === -1 ? ' is-desc' : ''}`} aria-hidden="true">
          <svg viewBox="0 0 8 10" width="8" height="10"><path className="is-up" d="M4 1.5 6.5 4h-5z" /><path className="is-dn" d="M4 8.5 1.5 6h5z" /></svg>
        </span>
      </button>
    </th>
  );
}

export function AssetTable({ groups, current, onSelect, q, sort, onSort }: {
  groups: RowGroup[];
  current: string | null;
  onSelect: (id: string) => void;
  q: string;
  sort: Sort;
  onSort: (k: SortKey) => void;
}) {
  const root = useRef<HTMLTableElement>(null);
  const want = useRowFocus(root, current);
  const flat = groups.flatMap(g => g.rows);
  const total = flat.length;
  let rowIndex = 1;

  const onKey = (e: KeyboardEvent) => {
    const next = step(flat, current, e.key);
    if (!next) return;
    e.preventDefault();
    want.current = true;
    onSelect(next);
  };

  return (
    <table ref={root} className="vd-as-table" role="grid" aria-label="资产列表" aria-rowcount={total + 1} onKeyDown={onKey}>
      <thead>
        <tr aria-rowindex={1}>
          <SortHead k="name" sort={sort} onSort={onSort} className="is-name">名称</SortHead>
          <th scope="col" className="is-kind">类型</th>
          <th scope="col" className="is-owner">负责部门</th>
          <SortHead k="updated" sort={sort} onSort={onSort} className="is-upd">更新时间</SortHead>
          <SortHead k="records" sort={sort} onSort={onSort} className="is-rec">记录数</SortHead>
          <th scope="col" className="is-trend">近 6 个月趋势</th>
        </tr>
      </thead>
      {groups.map(g => (
        <tbody key={g.id} className={`vd-as-tgroup is-${g.id}`}>
          <tr className="vd-as-grow" aria-hidden="true">
            <td colSpan={6}>
              <span className="vd-as-grow-label">{g.label}</span>
              <span className="vd-as-grow-en">{g.en}</span>
              <span className="vd-as-grow-n">{g.rows.length}</span>
            </td>
          </tr>
          {g.rows.map(r => {
            const { item } = r;
            const planned = r.group === 'planned';
            const on = !planned && item.id === current;
            const Ic = GLYPH[r.group];
            rowIndex += 1;
            return (
              <tr key={item.id} data-id={item.id} aria-rowindex={rowIndex}
                className={`vd-as-row${on ? ' is-on' : ''}${planned ? ' is-planned' : ''}`}
                aria-selected={planned ? undefined : on} aria-disabled={planned || undefined}
                tabIndex={planned ? undefined : on || (!current && rowIndex === 2) ? 0 : -1}
                onClick={planned ? undefined : () => onSelect(item.id)}
                onFocus={planned ? undefined : () => { if (!on) onSelect(item.id); }}>
                <td className="is-name">
                  <span className="vd-as-name">
                    <span className={`vd-as-glyph is-${r.group}`} aria-hidden="true"><Ic /></span>
                    <span className="vd-as-name-t">
                      <span className="vd-as-name-main"><Hit text={item.name} q={q} /></span>
                      <span className="vd-as-name-sub">
                        <span>{item.domainName}</span>
                        <span className="vd-as-dotsep" aria-hidden="true" />
                        <span className="vd-as-code">{r.code}</span>
                        <span className="vd-as-name-desc"><span className="vd-as-dotsep" aria-hidden="true" /><Hit text={item.desc} q={q} /></span>
                      </span>
                    </span>
                  </span>
                </td>
                <td className="is-kind"><span className={`vd-as-kind is-${r.group}`}>{GROUP_LABEL[r.group]}</span></td>
                <td className="is-owner"><Hit text={item.owner} q={q} /></td>
                <td className="is-upd">
                  {planned ? <span className="vd-as-none">—</span> : (
                    <time dateTime={item.updated.replace(' ', 'T')} title={item.updated}>
                      {shortDate(item.updated)}{timeOf(item.updated) && <small>{timeOf(item.updated)}</small>}
                    </time>
                  )}
                </td>
                <td className="is-rec">
                  {item.records != null
                    ? <span className="vd-as-rec"><b>{int(item.records)}</b><small>{recordUnit(item.id)}</small></span>
                    : <span className="vd-as-none">—</span>}
                </td>
                <td className="is-trend">
                  {planned ? (
                    <span className="vd-as-trend is-empty"><i aria-hidden="true" />暂无数据</span>
                  ) : (
                    <span className="vd-as-trend" title={`${item.trendLabel}：近 6 个月`}>
                      <Sparkline values={item.trend} color="var(--vd-as-spark)" width={64} height={24} pulse={on} />
                      <span className="vd-as-trend-v">{r.short}</span>
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      ))}
    </table>
  );
}

/** 卡片视图：同样分组，卡片网格；选中卡片主色描边 */
export function AssetCards({ groups, current, onSelect, q, headlineOf }: {
  groups: RowGroup[];
  current: string | null;
  onSelect: (id: string) => void;
  q: string;
  headlineOf: (item: CatalogItem) => { text: string; label: string } | null;
}) {
  const root = useRef<HTMLDivElement>(null);
  const want = useRowFocus(root, current);
  const flat = groups.flatMap(g => g.rows);
  const onKey = (e: KeyboardEvent) => {
    const key = e.key === 'ArrowRight' ? 'ArrowDown' : e.key === 'ArrowLeft' ? 'ArrowUp' : e.key;
    const next = step(flat, current, key);
    if (!next) return;
    e.preventDefault();
    want.current = true;
    onSelect(next);
  };

  return (
    <div ref={root} className="vd-as-cards" onKeyDown={onKey}>
      {groups.map(g => (
        <section key={g.id} className={`vd-as-cgroup is-${g.id}`} aria-label={`${g.label} ${g.rows.length} 项`}>
          <h3 className="vd-as-grow-h" aria-hidden="true">
            <span className="vd-as-grow-label">{g.label}</span>
            <span className="vd-as-grow-en">{g.en}</span>
            <span className="vd-as-grow-n">{g.rows.length}</span>
          </h3>
          <ul className="vd-as-cgrid">
            {g.rows.map(r => {
              const { item } = r;
              const planned = r.group === 'planned';
              const on = !planned && item.id === current;
              const Ic = GLYPH[r.group];
              const h = headlineOf(item);
              return (
                <li key={item.id}>
                  <button type="button" data-id={item.id} data-spot="" disabled={planned}
                    className={`vd-as-card${on ? ' is-on' : ''}${planned ? ' is-planned' : ''}`}
                    aria-pressed={planned ? undefined : on} tabIndex={planned ? -1 : on ? 0 : -1}
                    onClick={() => onSelect(item.id)}>
                    <span className="vd-as-card-top">
                      <span className={`vd-as-glyph is-${r.group}`} aria-hidden="true"><Ic /></span>
                      <span className={`vd-as-kind is-${r.group}`}>{GROUP_LABEL[r.group]}</span>
                      <span className="vd-as-code">{r.code}</span>
                    </span>
                    <span className="vd-as-card-name"><Hit text={item.name} q={q} /></span>
                    <span className="vd-as-card-meta">{item.domainName}<span className="vd-as-dotsep" aria-hidden="true" />{item.owner}</span>
                    {planned ? (
                      <span className="vd-as-card-foot is-empty"><span className="vd-as-trend is-empty"><i aria-hidden="true" />业务域筹备中，暂无可用资产</span></span>
                    ) : (
                      <span className="vd-as-card-foot">
                        <span className="vd-as-card-val">
                          <small>{item.kind === 'table' ? '合计' : h?.label ?? '当前值'}</small>
                          <b>{item.kind === 'table' ? item.valueLabel : h?.text}</b>
                        </span>
                        <Sparkline values={item.trend} color="var(--vd-as-spark)" width={96} height={30} pulse={on} />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
