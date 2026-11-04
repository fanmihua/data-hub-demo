import { ArrowRight } from 'lucide-react';
import { useSite } from '../../../core/provider';
import { dateTimeLabel, pct, wan } from '../../../core/data/format';
import { link, scrollToSection, Roll } from '../lib';
import { Ribbon } from './Ribbon';
import { Globe } from './Globe';

/** 首屏：蓝图网格 + 斜切流动色带 + 左栏文案与遥测读数 + 右栏点阵地球 */
export function Hero() {
  const { derived: d, data, fx } = useSite();
  const firstBoard = data.assets[0];
  return (
    <section className="va-hero" aria-labelledby="va-hero-title">
      <div className="va-hero-grid" aria-hidden="true" />
      <Ribbon />
      <div className="va-wrap va-hero-inner">
        <div className="va-hero-copy">
          <p className="va-hero-eyebrow va-mono">
            <span className="va-live-dot" aria-hidden="true" />
            MISSION DATA PORTAL · FY{d.meta.fiscalYear}
            <span className="va-demo-badge">演示数据</span>
          </p>
          <h1 id="va-hero-title">让每个型号的数据，<br />像测控一样清楚</h1>
          <p className="va-hero-lede">
            {d.meta.org}的合同、报账、付款与经营数据汇在一处，按型号、分系统、部门拆开看。每个数字都能追到对应的单据。
          </p>
          <div className="va-hero-cta">
            {firstBoard && (
              <a className="va-btn va-btn-primary" href={link('board', firstBoard.id)}>
                打开{firstBoard.name}看板<ArrowRight size={17} className="va-go" aria-hidden="true" />
              </a>
            )}
            <a className="va-btn" href={link('home', null, { section: 'assets' })}
              onClick={e => { if (scrollToSection('assets', fx.motion)) e.preventDefault(); }}>
              浏览数据资产
            </a>
          </div>
          <dl className="va-readouts">
            <div className="va-readout">
              <dt><span className="va-mono">T · AS OF</span>数据截至</dt>
              <dd className="va-num">{dateTimeLabel(d.meta.asOf)}</dd>
            </div>
            <div className="va-readout">
              <dt><span className="va-mono">CMPL · FY</span>年度目标完成率</dt>
              <dd className="va-num"><Roll value={Math.round(d.business.completion * 1000)} format={n => (n / 10).toFixed(1)} label={pct(d.business.completion)} /><small>%</small></dd>
            </div>
            <div className="va-readout is-signal">
              <dt><span className="va-mono">PENDING</span>待付款金额</dt>
              <dd className="va-num"><Roll value={d.spend.unpaid} format={n => wan(n)} label={`${wan(d.spend.unpaid)} 万元`} /><small>万元</small></dd>
            </div>
          </dl>
        </div>
        <div className="va-hero-visual">
          <Globe />
        </div>
      </div>
    </section>
  );
}
