import { useState } from 'react';
import type { Domain } from '../../../../core/data/types';
import type { CatalogItem, CatalogKind } from '../../model/types';
import { IconAssets, IconBoard, IconChevronRight, IconClock, IconMetric, IconTable } from '../../ui/icons';
import { GROUP_LABEL } from './lib';

/**
 * 左栏业务域树：全部资产 → 业务域 → 类型，每级带数量。
 * - 可用的业务域可以展开，点类型同时设置「业务域 + 类型」筛选；
 * - 筹备中的业务域灰显，带「筹备中」标记，点它只显示占位行；
 * - 底部是业务域覆盖：几个业务域已有资产。
 */
export interface TreeSel { domain: string; kind: CatalogKind | 'all' }

const KIND_ICON = { board: IconBoard, table: IconTable, metric: IconMetric } as const;
const KINDS: CatalogKind[] = ['board', 'table', 'metric'];

export function DomainTree({ domains, items, sel, onSelect }: {
  domains: Domain[];
  items: CatalogItem[];
  sel: TreeSel;
  onSelect: (s: TreeSel) => void;
}) {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const ready = items.filter(i => i.status === 'ready');
  const readyDomains = domains.filter(x => x.status === 'ready');
  const isAll = sel.domain === 'all' && sel.kind === 'all';

  return (
    <div className="vd-as-tree">
      <nav aria-label="按业务域筛选">
        <button type="button" className={`vd-as-tree-item is-root${isAll ? ' is-on' : ''}`} aria-current={isAll ? 'true' : undefined}
          onClick={() => onSelect({ domain: 'all', kind: 'all' })}>
          <span className="vd-as-tree-ic"><IconAssets /></span>
          <span className="vd-as-tree-name">全部资产</span>
          <span className="vd-as-tree-n">{items.length}</span>
        </button>

        <span className="vd-as-tree-div" aria-hidden="true" />
        <ul className="vd-as-tree-list">
          {domains.map(dom => {
            const own = ready.filter(i => i.domainId === dom.id);
            const planned = dom.status === 'planned';
            const open = !planned && !closed[dom.id];
            const on = sel.domain === dom.id && sel.kind === 'all';
            return (
              <li key={dom.id} className={planned ? 'is-planned' : undefined}>
                <div className="vd-as-tree-row">
                  {!planned && (
                    <button type="button" className={`vd-as-tree-tog${open ? ' is-open' : ''}`} aria-expanded={open}
                      aria-label={`${open ? '收起' : '展开'}${dom.name}`} onClick={() => setClosed(c => ({ ...c, [dom.id]: open }))}>
                      <IconChevronRight />
                    </button>
                  )}
                  <button type="button" className={`vd-as-tree-item is-domain${on ? ' is-on' : ''}${planned ? ' is-planned' : ''}`}
                    aria-current={on ? 'true' : undefined} onClick={() => onSelect({ domain: dom.id, kind: 'all' })}>
                    <span className={`vd-as-tree-dot${planned ? ' is-planned' : ''}`} aria-hidden="true" />
                    <span className="vd-as-tree-name">{dom.name}</span>
                    <span className="vd-as-tree-en" aria-hidden="true">{dom.english}</span>
                    {planned
                      ? <span className="vd-as-tree-tag"><IconClock />筹备中</span>
                      : <span className="vd-as-tree-n">{own.length}</span>}
                  </button>
                </div>
                {open && (
                  <ul className="vd-as-tree-sub">
                    {KINDS.map(k => {
                      const n = own.filter(i => i.kind === k).length;
                      if (!n) return null;
                      const Ic = KIND_ICON[k];
                      const subOn = sel.domain === dom.id && sel.kind === k;
                      return (
                        <li key={k}>
                          <button type="button" className={`vd-as-tree-item is-sub${subOn ? ' is-on' : ''}`} aria-current={subOn ? 'true' : undefined}
                            onClick={() => onSelect({ domain: dom.id, kind: k })}>
                            <span className="vd-as-tree-ic"><Ic /></span>
                            <span className="vd-as-tree-name">{GROUP_LABEL[k]}</span>
                            <span className="vd-as-tree-n">{n}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="vd-as-cover" aria-label={`业务域覆盖：${readyDomains.length} / ${domains.length} 个业务域已有资产`} role="group">
        <p className="vd-as-cover-h">
          <span>业务域覆盖</span>
          <b className="vd-num">{readyDomains.length}<small> / {domains.length}</small></b>
        </p>
        <span className="vd-as-cover-bar" aria-hidden="true">
          {domains.map(x => <i key={x.id} className={x.status === 'ready' ? 'is-ready' : ''} title={`${x.name} · ${x.status === 'ready' ? '已有资产' : '筹备中'}`} />)}
        </span>
        <p className="vd-as-cover-note">{readyDomains.map(x => x.name).join('、')}已有资产，其余筹备中</p>
      </div>
    </div>
  );
}
