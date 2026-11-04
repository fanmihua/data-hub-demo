import { Fragment, type ReactNode } from 'react';
import { useSite } from '../../../core/provider';
import { dateTimeLabel } from '../../../core/data/format';
import { IconChevronRight, IconSearch } from '../ui/icons';
import { dHref, isMac } from '../ui/lib';

/**
 * 顶栏（玻璃）：左侧面包屑；中间 ⌘K 搜索入口（跳到资产页并聚焦搜索）；右侧页面按钮 + 「演示数据 · 截至 …」与呼吸状态点。
 */
export function TopBar({ crumbs, actions, onSearch }: { crumbs: string[]; actions?: ReactNode; onSearch: () => void }) {
  const { data } = useSite();
  const mac = isMac();
  return (
    <header className="vd-top">
      <nav className="vd-crumbs" aria-label="当前位置">
        <a className="vd-crumb-root" href={dHref('home')}>
          <span className="vd-crumb-brand">Data Hub</span>
        </a>
        {crumbs.map((c, i) => (
          <Fragment key={`${i}-${c}`}>
            <IconChevronRight className="vd-crumb-sep" />
            <span className={`vd-crumb${i === crumbs.length - 1 ? ' is-current' : ''}`} aria-current={i === crumbs.length - 1 ? 'page' : undefined}>{c}</span>
          </Fragment>
        ))}
      </nav>
      <button type="button" className="vd-cmdk" onClick={onSearch} aria-label={`搜索资产、指标与看板（${mac ? '⌘K' : 'Ctrl K'}）`}>
        <IconSearch />
        <span className="vd-cmdk-text">搜索资产、指标与看板</span>
        <kbd className="vd-cmdk-kbd" aria-hidden="true">{mac ? <><span>⌘</span>K</> : <>Ctrl K</>}</kbd>
      </button>
      <div className="vd-top-right">
        {actions && <div className="vd-top-actions">{actions}</div>}
        <p className="vd-status" title="本页全部为虚构演示数据">
          <span className="vd-status-dot" aria-hidden="true" />
          <span className="vd-status-label">演示数据</span>
          <span className="vd-status-sep" aria-hidden="true">·</span>
          <span className="vd-status-time">截至 {dateTimeLabel(data.meta.asOf)}</span>
        </p>
      </div>
    </header>
  );
}
