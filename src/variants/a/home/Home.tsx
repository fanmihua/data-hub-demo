import { useEffect } from 'react';
import { useSite } from '../../../core/provider';
import type { Route } from '../../../core/route';
import { dateTimeLabel, pct, wanLabel } from '../../../core/data/format';
import { scrollToSection } from '../lib';
import { Hero } from './Hero';
import { Telemetry } from './Telemetry';
import { Overview } from './Overview';
import { Assets, Domains } from './Catalog';

function SecHead({ id, index, code, title, desc, aside }: { id: string; index: string; code: string; title: string; desc?: string; aside?: string }) {
  return (
    <header className="va-sec-head">
      <div>
        <p className="va-sec-index va-mono"><span>{index}</span><span>{code}</span></p>
        <h2 id={id}>{title}</h2>
        {desc ? <p className="va-sec-desc">{desc}</p> : null}
      </div>
      {aside ? <p className="va-sec-aside va-mono">{aside}</p> : null}
    </header>
  );
}

export function Home({ route }: { route: Route }) {
  const { derived: d, fx } = useSite();
  const section = route.query.get('section');

  // 外壳在路由变化后会滚回顶部（父组件 effect 在子组件之后执行），所以稍后再定位
  useEffect(() => {
    if (!section) return;
    const t = setTimeout(() => scrollToSection(section, fx.motion), 80);
    return () => clearTimeout(t);
  }, [section]); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = d.domains.filter(x => x.status === 'ready').length;
  return (
    <>
      <Hero />
      <section id="va-metrics" className="va-section va-metrics" aria-labelledby="va-metrics-title">
        <div className="va-wrap">
          <SecHead id="va-metrics-title" index="01" code="KEY METRICS" title="关键指标" desc={`全年目标 ${wanLabel(d.business.target, 0)}，已完成 ${pct(d.business.completion)}；报账 ${d.spend.billCount} 张，付款 ${d.spend.paymentCount} 笔。`}
            aside={`截至 ${dateTimeLabel(d.meta.asOf)}`} />
          <Telemetry />
        </div>
      </section>
      <section id="va-overview" className="va-section" aria-labelledby="va-overview-title">
        <div className="va-wrap">
          <header className="va-sec-head">
            <div>
              <p className="va-sec-index va-mono"><span>02</span><span>MISSION OVERVIEW</span></p>
              <h2 id="va-overview-title">经营与资金总览</h2>
              <p className="va-sec-desc">收入对照目标，资金从合同流到报账再到付款。悬停任意图形查看数值，主图可切换为数据表。</p>
            </div>
            <p className="va-sec-aside va-mono">{d.models.length} MODELS · {d.contracts.length} CONTRACTS · {d.spend.billCount} BILLS</p>
          </header>
          <Overview />
        </div>
      </section>
      <section id="va-domains" className="va-section" aria-labelledby="va-domains-title">
        <div className="va-wrap">
          <header className="va-sec-head">
            <div>
              <p className="va-sec-index va-mono"><span>03</span><span>DOMAINS</span></p>
              <h2 id="va-domains-title">业务域</h2>
              <p className="va-sec-desc">{d.domains.length} 个业务域，{ready} 个已开放看板，其余在筹备中。</p>
            </div>
          </header>
          <Domains />
        </div>
      </section>
      <section id="va-assets" className="va-section" aria-labelledby="va-assets-title">
        <div className="va-wrap">
          <header className="va-sec-head">
            <div>
              <p className="va-sec-index va-mono"><span>04</span><span>DATA ASSETS</span></p>
              <h2 id="va-assets-title">数据资产</h2>
              <p className="va-sec-desc">每个资产对应一块看板：筛选、指标、图表、明细，点任意一张报账单可以追到合同和付款。</p>
            </div>
          </header>
          <Assets />
        </div>
      </section>
    </>
  );
}
