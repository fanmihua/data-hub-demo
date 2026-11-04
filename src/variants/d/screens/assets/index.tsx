import { useEffect, useMemo, useRef, useState } from 'react';
import type { Route } from '../../../../core/route';
import { useDerived, useSite } from '../../../../core/provider';
import { dateTimeLabel } from '../../../../core/data/format';
import { buildCatalog } from '../../model/catalog';
import type { CatalogItem, CatalogKind } from '../../model/types';
import { Chip } from '../../ui/Chip';
import { Panel } from '../../ui/Panel';
import { isMac, VD_FOCUS_SEARCH } from '../../ui/lib';
import { AssetCards, AssetTable, type AssetRow, type RowGroup, type Sort, type SortKey } from './AssetTable';
import { AssetPreview } from './AssetPreview';
import { DomainTree, type TreeSel } from './DomainTree';
import { IconCards, IconClose, IconNoResult, IconSearch, IconTable } from './icons';
import { assetCode, groupOf, GROUPS, headline, matches, norm, shortValue } from './lib';
import './assets.css';

/**
 * 资产列表 #/d/assets（规范第 4.5 节、第 4.7 节第 3 条）。
 *   左：业务域树（数量、状态）    中：搜索 + 类型 / 部门筛选 + 表格或卡片    右：选中资产的预览
 * 网址参数：
 *   focus=search  进来时聚焦搜索框（⌘K 跳过来时带上；已在本页时外壳派发 VD_FOCUS_SEARCH）
 *   q=…           预填搜索词；asset=<目录 id> 预选一项（例如 table:bills）；view=cards 卡片视图
 * 全部数字来自 buildCatalog(data, useDerived())，不编造；筹备中业务域灰显、不能打开。
 */
const KIND_CHIPS: { id: CatalogKind | 'all'; label: string }[] = [
  { id: 'all', label: '全部' }, { id: 'board', label: '看板' }, { id: 'table', label: '数据表' }, { id: 'metric', label: '指标' },
];
const TRY_WORDS = ['合同', '报账', '回款', '完成率'];

export default function AssetsScreen({ route }: { route: Route }) {
  const { data, fx } = useSite();
  const d = useDerived();
  const items = useMemo(() => buildCatalog(data, d), [data, d]);
  const rows = useMemo<AssetRow[]>(() => items.map(item => ({ item, group: groupOf(item), code: assetCode(item, data), short: shortValue(item, d) })), [items, data, d]);

  const [q, setQ] = useState(() => route.query.get('q') ?? '');
  const [tree, setTree] = useState<TreeSel>({ domain: 'all', kind: 'all' });
  const [owner, setOwner] = useState('all');
  const [view, setView] = useState<'table' | 'cards'>(() => (route.query.get('view') === 'cards' ? 'cards' : 'table'));
  const [sel, setSel] = useState<string | null>(() => route.query.get('asset'));
  const [sort, setSort] = useState<Sort>({ key: null, dir: 1 });
  const search = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  /* ⌘K / 「/」聚焦搜索框 */
  const focusParam = route.query.get('focus');
  useEffect(() => { if (focusParam === 'search') search.current?.focus(); }, [focusParam]);
  useEffect(() => {
    const on = () => { search.current?.focus(); search.current?.select(); };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      on();
    };
    window.addEventListener(VD_FOCUS_SEARCH, on);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener(VD_FOCUS_SEARCH, on); window.removeEventListener('keydown', onKey); };
  }, []);

  /* 筛选：业务域 + 搜索是底集；类型、部门在底集上再筛，两个分面的数量互相参照 */
  const qn = norm(q);
  const kind = tree.kind;
  const base = rows.filter(r => (tree.domain === 'all' || r.item.domainId === tree.domain) && matches(r.item, qn));
  const byKind = (r: AssetRow, k: CatalogKind | 'all') => k === 'all' || (r.group !== 'planned' && r.item.kind === k);
  const byOwner = (r: AssetRow, o: string) => o === 'all' || (r.group !== 'planned' && r.item.owner === o);
  const shown = base.filter(r => byKind(r, kind) && byOwner(r, owner));
  const owners = [...new Set(items.filter(i => i.status === 'ready').map(i => i.owner))];
  const kindCount = (k: CatalogKind | 'all') => base.filter(r => r.group !== 'planned' && byKind(r, k) && byOwner(r, owner)).length;
  const ownerCount = (o: string) => base.filter(r => r.group !== 'planned' && byKind(r, kind) && byOwner(r, o)).length;

  const cmp = (a: AssetRow, b: AssetRow) => {
    if (!sort.key) return 0;
    const A = a.item, B = b.item;
    const v = sort.key === 'name' ? A.name.localeCompare(B.name, 'zh-CN')
      : sort.key === 'updated' ? A.updated.localeCompare(B.updated)
        : (A.records ?? -1) - (B.records ?? -1);
    return v * sort.dir;
  };
  const groups: RowGroup[] = GROUPS
    .map(g => ({ ...g, rows: shown.filter(r => r.group === g.id).sort(cmp) }))
    .filter(g => g.rows.length > 0);
  const ordered = groups.flatMap(g => g.rows).filter(r => r.group !== 'planned');
  const current = ordered.find(r => r.item.id === sel) ?? ordered[0] ?? null;
  const readyCount = shown.filter(r => r.group !== 'planned').length;
  const plannedCount = shown.length - readyCount;
  const filtered = !!qn || tree.domain !== 'all' || kind !== 'all' || owner !== 'all';

  const onSort = (k: SortKey) => setSort(s => (s.key !== k ? { key: k, dir: k === 'name' ? 1 : -1 } : s.dir === (k === 'name' ? 1 : -1) ? { key: k, dir: (s.dir * -1) as 1 | -1 } : { key: null, dir: 1 }));
  const clearAll = () => { setQ(''); setTree({ domain: 'all', kind: 'all' }); setOwner('all'); };
  const tryWords = TRY_WORDS.filter(w => w !== qn && items.some(i => matches(i, w)));

  /* 选中项变化时，让它出现在可视区域内（筛选后列表变短等情况） */
  // 只滚列表容器本身，不用 scrollIntoView（窄屏整页滚动时会把页面带跑）；表头吸顶，留出它的高度
  useEffect(() => {
    const box = scroller.current;
    if (!current || !box) return;
    const el = box.querySelector<HTMLElement>(`[data-id="${CSS.escape(current.item.id)}"]`);
    if (!el) return;
    const head = box.querySelector('thead')?.getBoundingClientRect().height ?? 0;
    const b = box.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (r.top < b.top + head) box.scrollTop -= b.top + head - r.top + 8;
    else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom + 8;
  }, [current?.item.id, view]); // eslint-disable-line react-hooks/exhaustive-deps

  const headlineOf = (item: CatalogItem) => headline(item, d);

  return (
    <div className="vd-screen vd-as">
      <Panel kicker="DOMAINS" title="业务域" className="vd-as-side">
        <DomainTree domains={data.domains} items={items} sel={tree} onSelect={setTree} />
      </Panel>

      <Panel className="vd-as-main">
        <div className="vd-as-head">
          <div className="vd-as-titles">
            <h1 className="vd-as-h1">数据资产</h1>
            <p className="vd-as-sub"><span className="vd-num">{items.filter(i => i.status === 'ready').length}</span> 项可用 · {data.domains.length} 个业务域</p>
          </div>
          <label className={`vd-as-search${q ? ' has-q' : ''}`}>
            <IconSearch />
            <span className="vd-sr">搜索资产</span>
            <input ref={search} type="search" value={q} placeholder="搜索名称、说明或负责部门" autoComplete="off" spellCheck={false}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') { if (q) { e.preventDefault(); setQ(''); } else search.current?.blur(); }
                if (e.key === 'ArrowDown') { e.preventDefault(); scroller.current?.querySelector<HTMLElement>('[data-id][tabindex="0"]')?.focus(); }
              }} />
            {q ? (
              <>
                <span className="vd-as-search-n" aria-live="polite">{readyCount} 项</span>
                <button type="button" className="vd-as-search-x" aria-label="清空搜索" onClick={() => { setQ(''); search.current?.focus(); }}><IconClose /></button>
              </>
            ) : (
              <kbd className="vd-as-kbd" aria-hidden="true">{isMac() ? '⌘K' : 'Ctrl K'}</kbd>
            )}
          </label>
          <div className="vd-seg vd-as-seg" role="radiogroup" aria-label="视图">
            <button type="button" role="radio" aria-checked={view === 'table'} className={view === 'table' ? 'is-on' : ''} onClick={() => setView('table')}><IconTable />表格</button>
            <button type="button" role="radio" aria-checked={view === 'cards'} className={view === 'cards' ? 'is-on' : ''} onClick={() => setView('cards')}><IconCards />卡片</button>
          </div>
        </div>

        <div className="vd-as-filters">
          <div className="vd-as-facet" role="group" aria-label="按类型筛选">
            <span className="vd-as-facet-k">类型</span>
            {KIND_CHIPS.map(k => (
              <Chip key={k.id} active={kind === k.id} onClick={() => setTree(t => ({ ...t, kind: k.id }))}>
                {k.label}<span className="vd-as-chip-n" data-zero={kindCount(k.id) === 0 || undefined}>{kindCount(k.id)}</span>
              </Chip>
            ))}
          </div>
          <span className="vd-as-facet-sep" aria-hidden="true" />
          <div className="vd-as-facet" role="group" aria-label="按负责部门筛选">
            <span className="vd-as-facet-k">部门</span>
            {owners.map(o => (
              <Chip key={o} active={owner === o} onClick={() => setOwner(x => (x === o ? 'all' : o))}>
                {o}<span className="vd-as-chip-n" data-zero={ownerCount(o) === 0 || undefined}>{ownerCount(o)}</span>
              </Chip>
            ))}
          </div>
          {filtered && <button type="button" className="vd-as-clear" onClick={clearAll}><IconClose />清除筛选</button>}
        </div>

        <div className={`vd-as-scroll is-${view}`} ref={scroller}>
          {shown.length === 0 ? (
            <div className="vd-as-empty is-list" role="status">
              <span className="vd-as-empty-ic" aria-hidden="true"><IconNoResult size={20} /></span>
              <p className="vd-as-empty-h">{qn ? <>没有找到与「{q.trim()}」相关的资产</> : '当前筛选下没有资产'}</p>
              <p className="vd-as-empty-t">按名称、说明和负责部门匹配。{tryWords.length > 0 && '可以试试：'}</p>
              <div className="vd-as-empty-try">
                {tryWords.map(w => <Chip key={w} onClick={() => setQ(w)}>{w}</Chip>)}
                <button type="button" className="vd-btn is-ghost" onClick={clearAll}>清除全部筛选</button>
              </div>
            </div>
          ) : view === 'table' ? (
            <AssetTable groups={groups} current={current?.item.id ?? null} onSelect={setSel} q={qn} sort={sort} onSort={onSort} />
          ) : (
            <AssetCards groups={groups} current={current?.item.id ?? null} onSelect={setSel} q={qn} headlineOf={headlineOf} />
          )}
        </div>

        <footer className="vd-as-status">
          <span><b>{readyCount}</b> 项{plannedCount > 0 && <> · 筹备中 <b>{plannedCount}</b></>}</span>
          <span className="vd-as-status-keys" aria-hidden="true"><kbd>↑</kbd><kbd>↓</kbd> 切换 <kbd>/</kbd> 搜索</span>
          <span className="vd-as-status-asof">演示数据 · 截至 {dateTimeLabel(data.meta.asOf)}</span>
        </footer>
      </Panel>

      <Panel className="vd-as-preview">
        <AssetPreview row={current} data={data} d={d} motion={fx.motion} q={qn} planned={current ? [] : shown.filter(r => r.group === 'planned').map(r => r.item)} />
      </Panel>
    </div>
  );
}
