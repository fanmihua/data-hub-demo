import { useRef } from 'react';
import { ArrowUpRight, Hourglass } from 'lucide-react';
import { useDerived, useSite } from '../../../core/provider';
import { useSpotlight } from '../../../core/fx/hooks';
import { pct, wan } from '../../../core/data/format';
import { link, useModelColor, clamp } from '../lib';

const DOMAIN_COLORS = ['var(--accent)', 'var(--va-m2)', 'var(--va-m3)', 'var(--va-m4)', '#4F7CAC', 'var(--va-ink-3)'];

/** 业务域：3×2 卡片，带域色条、状态、资产数；没有看板的域如实标「筹备中」 */
export function Domains() {
  const { data } = useSite();
  const d = useDerived();
  return (
    <ul className="va-domains">
      {d.domains.map((dm, i) => {
        const assets = data.assets.filter(a => a.domain === dm.id);
        const ready = dm.status === 'ready';
        return (
          <li key={dm.id} className={`va-domain${ready ? '' : ' is-planned'}`} style={{ ['--dc' as string]: DOMAIN_COLORS[i % DOMAIN_COLORS.length] }}>
            <span className="va-domain-bar" aria-hidden="true" />
            <div className="va-domain-head">
              <span className="va-mono">D-{String(i + 1).padStart(2, '0')} · {dm.english}</span>
              {ready
                ? <span className="va-domain-state is-ready"><i aria-hidden="true" />已开放</span>
                : <span className="va-domain-state"><Hourglass size={13} aria-hidden="true" />筹备中</span>}
            </div>
            <h3>{dm.name}</h3>
            <p className="va-domain-desc">{dm.desc}</p>
            <ul className="va-domain-cats" aria-label="数据分类">
              {dm.categories.map(c => <li key={c} className="va-tag">{c}</li>)}
            </ul>
            <div className="va-domain-foot">
              <span className="va-num va-domain-count">{dm.assetCount}<small> 个资产</small></span>
              {ready && assets.length > 0 ? (
                <span className="va-domain-links">
                  {assets.map(a => <a key={a.id} href={link('board', a.id)}>{a.name}<ArrowUpRight size={14} aria-hidden="true" /></a>)}
                </span>
              ) : <span className="va-domain-wait">暂无看板</span>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** 资产入口：每个看板一张卡，附一张按资产侧重的小预览 */
export function Assets() {
  const { data } = useSite();
  const d = useDerived();
  const color = useModelColor();
  const box = useRef<HTMLUListElement>(null);
  useSpotlight(box, true);

  const preview = (id: string) => {
    if (id === 'contracts') {
      return (
        <div className="va-ap va-ap-rows" aria-hidden="true">
          {d.contracts.slice(0, 4).map(c => (
            <div key={c.id}><span>{c.id.slice(-3)}</span><i><b style={{ transform: `scaleX(${clamp(c.billRate, 0, 1)})` }} /><b className="is-paid" style={{ transform: `scaleX(${clamp(c.payRate, 0, 1)})` }} /></i><em className="va-num">{pct(c.payRate, 0)}</em></div>
          ))}
        </div>
      );
    }
    if (id === 'expenses') {
      const max = Math.max(1, ...d.billsByMonth.map(m => m.billed));
      return (
        <div className="va-ap va-ap-cols" aria-hidden="true">
          {d.billsByMonth.map(m => (
            <div key={m.month}><i style={{ transform: `scaleY(${m.billed / max})` }} /><span>{m.label.replace(' ', '')}</span></div>
          ))}
        </div>
      );
    }
    if (id === 'operations') {
      return (
        <div className="va-ap va-ap-rows" aria-hidden="true">
          {d.models.map(m => (
            <div key={m.id}><span>{m.id}</span><i><b className="is-paid" style={{ transform: `scaleX(${clamp(m.completion, 0, 1)})`, background: color(m.id) }} /></i><em className="va-num">{pct(m.completion, 0)}</em></div>
          ))}
        </div>
      );
    }
    return null;
  };
  const stat = (id: string) => {
    if (id === 'contracts') return [`${d.contracts.length} 份合同`, `${wan(d.spend.contractAmount)} 万元`];
    if (id === 'expenses') return [`${d.spend.billCount} 张报账单`, `${wan(d.spend.billed)} 万元`];
    if (id === 'operations') return [`${d.models.length} 个型号`, `${wan(d.business.revenue)} 万元`];
    return [];
  };

  return (
    <ul ref={box} className="va-assets va-spotlit">
      {data.assets.map(a => (
        <li key={a.id} className="va-asset va-card va-spot" data-spot>
          <a href={link('board', a.id)} className="va-asset-link" aria-label={`打开看板：${a.name}`} />
          <div className="va-asset-head">
            <span className="va-mono">{a.code}</span>
            <span className="va-asset-go" aria-hidden="true"><ArrowUpRight size={18} /></span>
          </div>
          <h3>{a.name}</h3>
          <p className="va-asset-desc">{a.desc}</p>
          {preview(a.id)}
          <dl className="va-asset-meta">
            {stat(a.id).length > 0 && <div><dt>规模</dt><dd>{stat(a.id).join(' · ')}</dd></div>}
            <div><dt>负责</dt><dd>{a.owner}</dd></div>
            <div><dt>来源</dt><dd>{a.source}</dd></div>
            <div><dt>更新</dt><dd className="va-num">{a.updated}</dd></div>
          </dl>
          <ul className="va-asset-tags" aria-label="标签">{a.tags.map(t => <li key={t} className="va-tag">{t}</li>)}</ul>
        </li>
      ))}
    </ul>
  );
}
