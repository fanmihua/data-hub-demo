import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { ArrowUpRightIcon, ChartLineIcon, TableIcon } from '@phosphor-icons/react';
import { useSite } from '../../core/provider';
import { NumberRoller } from '../../core/ui/NumberRoller';
import { dateTimeLabel, int, pct, pctNumber, wan, wanLabel } from '../../core/data/format';
import type { Route } from '../../core/route';
import { AskBox, type AskHandle, type AskSignal } from './Ask';
import { Orb } from './Orb';
import { ParticleChart } from './ParticleChart';
import { ChartCard, DataTable } from './charts/common';
import { LineChart } from './charts/LineChart';
import { Bubbles, Rings } from './charts/Radial';
import { Sankey } from './charts/Sankey';
import { Spark } from './charts/Mini';
import { bHref, scrollToEl, useModelColor, useTilt } from './lib';

export function Home({ route, askRef }: { route: Route; askRef: Ref<AskHandle> }) {
  const { fx } = useSite();
  const section = route.query.get('section');
  useEffect(() => {
    if (!section) return;
    // 等外壳把页面滚回顶部之后再定位
    const t = setTimeout(() => scrollToEl(document.getElementById(`vb-sec-${section}`), fx.motion), 80);
    return () => clearTimeout(t);
  }, [section]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main id="vb-main" className="vb-home" tabIndex={-1}>
      <Hero route={route} askRef={askRef} />
      <Metrics />
      <InsightStream />
      <ParticleSection />
      <Directory route={route} />
      <Footer />
    </main>
  );
}

/* ───────── 首屏：光球 + 问候 + 检索 ───────── */

function Hero({ route, askRef }: { route: Route; askRef: Ref<AskHandle> }) {
  const { data } = useSite();
  const [sig, setSig] = useState<AskSignal>({ energy: 0, pulse: 0, thinking: false });
  return (
    <section id="vb-sec-ask" className="vb-hero" aria-labelledby="vb-hero-title">
      <div className="vb-hero-aurora" aria-hidden="true" />
      <p className="vb-pill"><span className="vb-live-dot" aria-hidden="true" />演示数据 · 截至 {dateTimeLabel(data.meta.asOf)}</p>
      <Orb signal={sig} />
      <h1 id="vb-hero-title" className="vb-hero-title">你好，想看哪个<br className="vb-br-sm" />型号的数据？</h1>
      <p className="vb-hero-sub">{data.meta.org} {data.meta.fiscalYear} 年的经营、合同与支出数据都在这里。问一句，或者往下看四条洞察。</p>
      <AskBox ref={askRef} route={route} onSignal={setSig} />
    </section>
  );
}

/* ───────── 关键指标 ───────── */

function Metric({ label, children, foot, viz }: { label: string; children: ReactNode; foot: ReactNode; viz?: ReactNode }) {
  return (
    <li className="vb-metric">
      <span className="vb-metric-label">{label}</span>
      <span className="vb-metric-value">{children}</span>
      {viz && <span className="vb-metric-viz">{viz}</span>}
      <span className="vb-metric-foot">{foot}</span>
    </li>
  );
}

function Metrics() {
  const { derived: d } = useSite();
  const totals = d.monthlyRevenue.map(x => x.total);
  const unpaidBills = d.bills.filter(b => b.unpaid > 0).length;
  return (
    <section className="vb-section vb-metrics-sec" aria-labelledby="vb-metrics-t">
      <h2 id="vb-metrics-t" className="vb-sr">关键指标</h2>
      <ul className="vb-metrics">
        <Metric label="年度目标完成" foot={<>目标 {wanLabel(d.business.target)}</>}
          viz={<span className="vb-meter" role="img" aria-label={`完成 ${pct(d.business.completion)}`}><i style={{ width: `${Math.min(100, d.business.completion * 100)}%` }} /></span>}>
          <NumberRoller value={d.business.completion} format={v => pctNumber(v)} label={pct(d.business.completion)} /><small aria-hidden="true">%</small>
        </Metric>
        <Metric label="已确认收入" foot={<>近 {totals.length} 个月走势</>}
          viz={<Spark values={totals} labels={d.monthLabels} fmt={v => wanLabel(v)} />}>
          <NumberRoller value={d.business.revenue} format={v => wan(v)} label={wanLabel(d.business.revenue)} /><small aria-hidden="true">万元</small>
        </Metric>
        <Metric label="回款率" foot={<>已回款 {wanLabel(d.business.received)}</>}
          viz={<span className="vb-meter is-2" role="img" aria-label={`回款率 ${pct(d.business.receivedRate)}`}><i style={{ width: `${Math.min(100, d.business.receivedRate * 100)}%` }} /></span>}>
          <NumberRoller value={d.business.receivedRate} format={v => pctNumber(v)} label={pct(d.business.receivedRate)} /><small aria-hidden="true">%</small>
        </Metric>
        <Metric label="报账金额" foot={<>{int(d.spend.billCount)} 张单据，已付 {pct(d.spend.payRate)}</>}>
          <NumberRoller value={d.spend.billed} format={v => wan(v)} label={wanLabel(d.spend.billed)} /><small aria-hidden="true">万元</small>
        </Metric>
        <Metric label="待付款" foot={<>{unpaidBills} 张单据未付清</>}>
          <NumberRoller value={d.spend.unpaid} format={v => wan(v)} label={wanLabel(d.spend.unpaid)} /><small aria-hidden="true">万元</small>
        </Metric>
      </ul>
    </section>
  );
}

/* ───────── 洞察流：倾斜 + 锥形渐变边框 ───────── */

function TiltCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { fx } = useSite();
  useTilt(ref, fx.motion, 3.5);
  return (
    <div ref={ref} className={`vb-tilt ${className}`}>
      <span className="vb-tilt-ring" aria-hidden="true" />
      <span className="vb-tilt-glare" aria-hidden="true" />
      {children}
    </div>
  );
}

function InsightStream() {
  const { derived: d } = useSite();
  const colorOf = useModelColor();
  const peak = [...d.monthlyRevenue].sort((a, b) => b.total - a.total)[0];
  const topSys = d.bySystem[0];
  const low = [...d.models].sort((a, b) => a.completion - b.completion)[0];
  const lineSeries = d.models.map(m => ({ key: m.id, label: m.id, color: colorOf(m.id), values: m.monthly, area: m === d.models[0] }));
  const nodeColor = (n: { kind: string; label: string; id: string }) =>
    n.kind === 'model' ? colorOf(n.label) : n.id === 'st:paid' ? 'var(--vb-ok)' : n.id === 'st:unpaid' ? 'var(--vb-warn)' : 'var(--vb-node)';

  return (
    <section id="vb-sec-insights" className="vb-section" aria-labelledby="vb-insights-t">
      <header className="vb-sec-head">
        <span className="vb-eyebrow">洞察</span>
        <h2 id="vb-insights-t">数据里值得看的四件事</h2>
        <p>每张卡片的结论都由下面的图算出来，换了数据会跟着变。</p>
      </header>
      <div className="vb-insights">
        <TiltCard className="is-wide">
          <ChartCard eyebrow="月度收入" title={peak ? `${peak.label}收入最高，${wanLabel(peak.total)}` : '月度收入'}
            note={`近 ${d.months.length} 个月各型号的收入走势，单位万元。`}
            legend={lineSeries.map(s => ({ label: s.label, color: s.color, kind: 'line' as const }))}>
            <LineChart labels={d.monthLabels} keys={d.months} series={lineSeries} height={250} glow fmt={v => wanLabel(v)} axisFmt={v => wan(v, 0)}
              pulse={d.models[0]?.id} ariaLabel={`月度收入折线图，${d.models.map(m => `${m.id} 合计 ${wanLabel(m.monthly.reduce((a, b) => a + b, 0))}`).join('，')}`} />
          </ChartCard>
        </TiltCard>
        <TiltCard>
          <ChartCard eyebrow="年度完成" title={`全年目标完成 ${pct(d.business.completion)}`} note={low ? `${low.id} 完成率最低，为 ${pct(low.completion)}。` : undefined}>
            <Rings size={200} centerValue={pct(d.business.completion)} centerLabel="全部型号"
              ariaLabel={`年度目标完成率环形图：${d.models.map(m => `${m.id} ${pct(m.completion)}`).join('，')}`}
              items={d.models.map(m => ({ key: m.id, label: m.id, ratio: m.completion, color: colorOf(m.id), display: pct(m.completion), detail: `${wan(m.revenue)} / ${wan(m.target)} 万元` }))} />
          </ChartCard>
        </TiltCard>
        <TiltCard className="is-wide">
          <ChartCard eyebrow="资金流向" title={`报账 ${wanLabel(d.spend.billed)}，已付 ${pct(d.spend.payRate)}`}
            note="从型号到分系统，再到已付款和待付款。悬停一条线看金额。"
            legend={[...d.models.map(m => ({ label: m.id, color: colorOf(m.id), kind: 'bar' as const })), { label: '已付款', color: 'var(--vb-ok)', kind: 'bar' as const }, { label: '待付款', color: 'var(--vb-warn)', kind: 'bar' as const }]}>
            <Sankey nodes={d.flow.nodes} links={d.flow.links} height={260} nodeColor={nodeColor} fmt={v => wan(v)} flow
              ariaLabel={`资金流向桑基图：报账 ${wanLabel(d.spend.billed)}，已付款 ${wanLabel(d.spend.paid)}，待付款 ${wanLabel(d.spend.unpaid)}`} />
          </ChartCard>
        </TiltCard>
        <TiltCard>
          <ChartCard eyebrow="分系统" title={topSys ? `${topSys.key}支出最多` : '分系统支出'}
            note={topSys ? `占全部报账的 ${pct(d.spend.billed ? topSys.billed / d.spend.billed : 0)}。外圈是报账，内圈是已付。` : undefined}
            legend={[{ label: '报账', color: 'rgb(var(--accent-rgb) / .16)', kind: 'dot' }, { label: '已付', color: 'rgb(var(--accent-rgb) / .5)', kind: 'dot' }]}>
            <Bubbles height={250} ariaLabel={`分系统支出气泡图：${d.bySystem.map(g => `${g.key} ${wanLabel(g.billed)}`).join('，')}`}
              items={d.bySystem.map(g => ({ key: g.key, label: g.key.replace('分系统', ''), value: g.billed, inner: g.paid, display: wan(g.billed), detail: <><div className="vb-tip-row"><span>报账</span><b>{wanLabel(g.billed)}</b></div><div className="vb-tip-row"><span>已付</span><b>{wanLabel(g.paid)}</b></div><div className="vb-tip-row"><span>单据</span><b>{g.count} 张</b></div></> }))} />
          </ChartCard>
        </TiltCard>
      </div>
    </section>
  );
}

/* ───────── 粒子成图 ───────── */

function ParticleSection() {
  const { derived: d } = useSite();
  const colorOf = useModelColor();
  const [table, setTable] = useState(false);
  const [h, setH] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 280 : 360));
  useEffect(() => {
    const on = () => setH(window.innerWidth < 640 ? 280 : 360);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return (
    <section id="vb-sec-particles" className="vb-section" aria-labelledby="vb-particles-t">
      <header className="vb-sec-head">
        <span className="vb-eyebrow">粒子成图</span>
        <h2 id="vb-particles-t">各型号的月度收入</h2>
        <p>滚到这里时，散开的粒子会按每个月、每个型号的收入落位。悬停任意一根柱子看数值。</p>
      </header>
      <div className="vb-card vb-particles-card">
        <div className="vb-particles-top">
          <ul className="vb-particles-legend" aria-label="图例与合计">
            {d.models.map(m => (
              <li key={m.id}>
                <i className="vb-sw is-dot" style={{ background: colorOf(m.id) }} aria-hidden="true" />
                <span>{m.id}</span>
                <b><NumberRoller value={m.monthly.reduce((a, b) => a + b, 0)} format={v => wan(v)} label={wanLabel(m.monthly.reduce((a, b) => a + b, 0))} /><small aria-hidden="true">万元</small></b>
              </li>
            ))}
          </ul>
          <div className="vb-seg" role="group" aria-label="显示方式">
            <button type="button" aria-pressed={!table} onClick={() => setTable(false)}><ChartLineIcon size={15} aria-hidden="true" /><span>图</span></button>
            <button type="button" aria-pressed={table} onClick={() => setTable(true)}><TableIcon size={15} aria-hidden="true" /><span>数据表</span></button>
          </div>
        </div>
        {table ? (
          <DataTable caption="各型号月度收入（万元）"
            columns={[{ key: 'm', label: '月份' }, ...d.models.map(m => ({ key: m.id, label: m.id, num: true })), { key: 't', label: '合计', num: true }]}
            rows={d.monthlyRevenue.map(pt => ({ m: pt.label, ...Object.fromEntries(d.models.map(m => [m.id, wan(pt.byModel[m.id] ?? 0)])), t: wan(pt.total) }))} />
        ) : <ParticleChart height={h} />}
      </div>
    </section>
  );
}

/* ───────── 看板与业务域 ───────── */

function Directory({ route }: { route: Route }) {
  const { data, derived: d } = useSite();
  const statOf = (id: string) => {
    if (id === 'contracts') return `${d.spend.contractCount} 份合同 · 已付 ${wanLabel(d.spend.paid)}`;
    if (id === 'expenses') return `${d.spend.billCount} 张单据 · 报账 ${wanLabel(d.spend.billed)}`;
    if (id === 'operations') return `${d.models.length} 个型号 · 完成 ${pct(d.business.completion)}`;
    return '';
  };
  return (
    <section id="vb-sec-domains" className="vb-section vb-directory" aria-labelledby="vb-dir-t">
      <div className="vb-directory-aurora" aria-hidden="true" />
      <header className="vb-sec-head">
        <span className="vb-eyebrow">看板与业务域</span>
        <h2 id="vb-dir-t">从这里进入每一块数据</h2>
        <p>{d.domains.filter(x => x.status === 'ready').length} 个业务域已有看板，其余 {d.domains.filter(x => x.status !== 'ready').length} 个在筹备中。</p>
      </header>
      <ul className="vb-assets">
        {data.assets.map(a => {
          const dom = data.domains.find(x => x.id === a.domain);
          return (
            <li key={a.id}>
              <a className="vb-glass vb-asset" href={bHref(route, 'board', a.id)}>
                <span className="vb-asset-top"><span className="vb-chip">{dom?.name} · {a.category}</span><code>{a.code}</code></span>
                <strong>{a.name}</strong>
                <span className="vb-asset-desc">{a.desc}</span>
                <span className="vb-asset-stat">{statOf(a.id)}</span>
                <span className="vb-asset-foot"><span>{a.owner} · 更新于 {a.updated}</span><ArrowUpRightIcon size={18} aria-hidden="true" /></span>
              </a>
            </li>
          );
        })}
      </ul>
      <ul className="vb-domains">
        {d.domains.map(x => (
          <li key={x.id} className={`vb-glass vb-domain${x.status === 'ready' ? '' : ' is-planned'}`}>
            <span className="vb-domain-en">{x.english}</span>
            <strong>{x.name}</strong>
            <span className="vb-domain-desc">{x.desc}</span>
            <span className="vb-domain-foot">
              {x.status === 'ready'
                ? <span className="vb-status is-ready"><i aria-hidden="true" />{x.assetCount} 个看板</span>
                : <span className="vb-status is-planned"><i aria-hidden="true" />筹备中</span>}
              <span className="vb-domain-cats">{x.categories.join(' · ')}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Footer() {
  const { data } = useSite();
  return (
    <footer className="vb-footer">
      <p><strong>Data Hub</strong> · {data.meta.org}</p>
      <p>{data.meta.note} 数据截至 {dateTimeLabel(data.meta.asOf)}。</p>
      <p>「问数据」按关键词匹配本地演示数据，没有接入 AI 或业务系统。</p>
    </footer>
  );
}
