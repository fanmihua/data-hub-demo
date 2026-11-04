import { useSite } from '../../../core/provider';
import { dateTimeLabel } from '../../../core/data/format';
import { link } from '../lib';
import { Logo } from './Nav';

/** 页脚：深空藏青，两种模式下都是深底 */
export function Footer() {
  const { data } = useSite();
  const { meta } = data;
  return (
    <footer className="va-footer">
      <svg className="va-footer-orbit" viewBox="0 0 1200 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <ellipse cx="980" cy="330" rx="520" ry="150" />
        <ellipse cx="980" cy="330" rx="420" ry="110" />
        <ellipse cx="980" cy="330" rx="320" ry="74" />
        <circle cx="568" cy="262" r="3" className="is-sat" />
      </svg>
      <div className="va-wrap va-footer-inner">
        <div className="va-footer-brand">
          <a className="va-brand" href={link('home')}><Logo /><span>Data Hub</span></a>
          <p>{meta.org} · {meta.title} 数据门户。{meta.note}</p>
          <p className="va-mono">DEMO DATA · AS OF {dateTimeLabel(meta.asOf)} · FY{meta.fiscalYear}</p>
        </div>
        <nav className="va-footer-col" aria-label="看板">
          <h2 className="va-mono">BOARDS 看板</h2>
          {data.assets.map(a => <a key={a.id} href={link('board', a.id)}>{a.name}</a>)}
        </nav>
        <nav className="va-footer-col" aria-label="业务域">
          <h2 className="va-mono">DOMAINS 业务域</h2>
          {data.domains.map(d => (
            d.status === 'ready'
              ? <a key={d.id} href={link('home', null, { section: 'domains' })}>{d.name}</a>
              : <span key={d.id} className="is-planned">{d.name}<em>筹备中</em></span>
          ))}
        </nav>
        <div className="va-footer-col">
          <h2 className="va-mono">NOTE 说明</h2>
          <p>页面数字全部来自本地演示数据，未接入真实业务系统。可在「风格与数据」面板里替换数据与风格。</p>
          <p className="va-mono">截至 {dateTimeLabel(meta.asOf)}</p>
        </div>
      </div>
    </footer>
  );
}
