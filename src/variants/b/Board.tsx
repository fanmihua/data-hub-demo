import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowCounterClockwiseIcon, ArrowLeftIcon, CheckCircleIcon, CircleHalfIcon, CircleIcon, LightbulbIcon, XIcon } from '@phosphor-icons/react';
import { useDerived, useSite } from '../../core/provider';
import type { BillRow, DataFilter, Derived, FlowNode, PaymentStatus } from '../../core/data/derive';
import { dateTimeLabel, dayLabel, int, pct, pctNumber, wan, wanLabel } from '../../core/data/format';
import { NumberRoller } from '../../core/ui/NumberRoller';
import type { Route } from '../../core/route';
import { ChartCard, DataTable } from './charts/common';
import { LineChart } from './charts/LineChart';
import { BarChart, HBars } from './charts/BarChart';
import { Donut, Rings } from './charts/Radial';
import { Sankey } from './charts/Sankey';
import { OrbCss } from './Orb';
import { boardPoints, type Point } from './insights';
import { bHref, scrollToEl, STATUS_CLASS, useModelColor } from './lib';

type Flash = { target: string; focus?: string; n: number } | null;

export function Board({ route, assetId }: { route: Route; assetId: string }) {
  const { data, fx } = useSite();
  const asset = data.assets.find(a => a.id === assetId);
  if (!asset) return <NotFound route={route} assetId={assetId} />;
  const kind = (['contracts', 'expenses', 'operations'] as const).find(k => k === asset.id) ?? (asset.domain === 'business' ? 'operations' : 'expenses');
  return <BoardInner key={asset.id} route={route} assetId={asset.id} kind={kind} motion={fx.motion} />;
}

function BoardInner({ route, assetId, kind, motion }: { route: Route; assetId: string; kind: 'contracts' | 'expenses' | 'operations'; motion: boolean }) {
  const { data, derived: all } = useSite();
  const asset = data.assets.find(a => a.id === assetId)!;
  const domain = data.domains.find(x => x.id === asset.domain);
  const [models, setModels] = useState<string[]>([]);
  const [period, setPeriod] = useState('all');
  const [extra, setExtra] = useState('');
  const filter: DataFilter = useMemo(() => ({
    models, period,
    ...(kind === 'expenses' && extra ? { depts: [extra] } : {}),
    ...(kind === 'contracts' && extra ? { systems: [extra] } : {}),
  }), [models, period, extra, kind]);
  const d = useDerived(filter);
  const points = useMemo(() => boardPoints(kind, d), [kind, d]);
  const [flash, setFlash] = useState<Flash>(null);
  const [bill, setBill] = useState<BillRow | null>(null);
  const flashTimer = useRef(0);
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  const pick = (p: Point) => {
    clearTimeout(flashTimer.current);
    setFlash(f => ({ target: p.target, focus: p.focus, n: (f?.n ?? 0) + 1 }));
    scrollToEl(document.getElementById(p.target), motion, 140);
    flashTimer.current = window.setTimeout(() => setFlash(null), 3200);
  };
  const fOf = (id: string) => (flash?.target === id ? flash.focus ?? null : null);
  const isFlash = (id: string) => flash?.target === id;
  const dirty = models.length > 0 || period !== 'all' || !!extra;
  const toggleModel = (id: string) => setModels(ms => (ms.includes(id) ? ms.filter(x => x !== id) : [...ms, id]));

  return (
    <main id="vb-main" className="vb-board" tabIndex={-1}>
      <header className="vb-board-head">
        <nav className="vb-crumbs" aria-label="面包屑">
          <a href={bHref(route)}><ArrowLeftIcon size={14} aria-hidden="true" />首页</a>
          <span aria-hidden="true">/</span>
          <span>{domain?.name ?? '业务域'}</span>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{asset.name}</span>
        </nav>
        <div className="vb-board-title">
          <OrbCss small />
          <div>
            <h1>{asset.name}</h1>
            <p>{asset.desc}</p>
          </div>
        </div>
        <ul className="vb-board-meta">
          <li><code>{asset.code}</code></li>
          <li>负责：{asset.owner}</li>
          <li>来源：{asset.source}</li>
          <li><span className="vb-live-dot" aria-hidden="true" />演示数据 · 截至 {dateTimeLabel(data.meta.asOf)}</li>
        </ul>
      </header>

      <div className="vb-filters" role="region" aria-label="筛选">
        <div className="vb-filter">
          <span className="vb-filter-label" id="vb-f-model">型号</span>
          <div className="vb-chips" role="group" aria-labelledby="vb-f-model">
            <button type="button" className="vb-fchip" aria-pressed={models.length === 0} onClick={() => setModels([])}>全部</button>
            {all.options.models.map(id => (
              <button key={id} type="button" className="vb-fchip" aria-pressed={models.includes(id)} onClick={() => toggleModel(id)}>
                <ModelDot id={id} />{id}
              </button>
            ))}
          </div>
        </div>
        <label className="vb-filter">
          <span className="vb-filter-label">期间</span>
          <select className="vb-select" value={period} onChange={e => setPeriod(e.target.value)}>
            {all.options.periods.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>
        {kind === 'expenses' && (
          <label className="vb-filter">
            <span className="vb-filter-label">部门</span>
            <select className="vb-select" value={extra} onChange={e => setExtra(e.target.value)}>
              <option value="">全部部门</option>
              {all.options.depts.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
        )}
        {kind === 'contracts' && (
          <label className="vb-filter">
            <span className="vb-filter-label">分系统</span>
            <select className="vb-select" value={extra} onChange={e => setExtra(e.target.value)}>
              <option value="">全部分系统</option>
              {all.options.systems.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
        )}
        <span className="vb-filter-sum" aria-live="polite">{d.spend.billCount} 张单据 · {d.models.length} 个型号</span>
        {dirty && <button type="button" className="vb-btn is-ghost" onClick={() => { setModels([]); setPeriod('all'); setExtra(''); }}><ArrowCounterClockwiseIcon size={15} aria-hidden="true" />重置</button>}
      </div>

      <div className="vb-board-grid">
        <aside className="vb-points" aria-labelledby="vb-points-t">
          <div className="vb-points-in">
            <h2 id="vb-points-t"><LightbulbIcon size={16} weight="fill" aria-hidden="true" />本页要点</h2>
            <p className="vb-points-note">按固定规则从当前筛选的数据里挑出，点一条定位到对应的图。</p>
            <ol>
              {points.map((p, i) => (
                <li key={p.id}>
                  <button type="button" onClick={() => pick(p)} className={flash?.target === p.target && flash?.focus === p.focus ? 'is-on' : undefined} style={{ ['--i' as string]: i }}>
                    <span className="vb-points-n">{String(i + 1).padStart(2, '0')}</span>
                    <span>{p.text.split(/\*\*(.+?)\*\*/g).map((s, j) => (j % 2 ? <strong key={j}>{s}</strong> : s))}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </aside>

        <div className="vb-board-main">
          <BoardMetrics kind={kind} d={d} />
          {kind === 'operations' && <OperationsCharts d={d} fOf={fOf} isFlash={isFlash} />}
          {kind === 'contracts' && <ContractsCharts d={d} fOf={fOf} isFlash={isFlash} />}
          {kind === 'expenses' && <ExpensesCharts d={d} fOf={fOf} isFlash={isFlash} />}
          <BillsTable d={d} onOpen={setBill} flash={isFlash('bills')} />
        </div>
      </div>
      {bill && <ChainDrawer bill={bill} onClose={() => setBill(null)} />}
    </main>
  );
}

function ModelDot({ id }: { id: string }) {
  const colorOf = useModelColor();
  return <i className="vb-sw is-dot" style={{ background: colorOf(id) }} aria-hidden="true" />;
}

/* ───────── 指标行 ───────── */

function Tile({ label, value, fmt, unit, foot }: { label: string; value: number; fmt: (v: number) => string; unit: string; foot: ReactNode }) {
  return (
    <li className="vb-tile">
      <span className="vb-metric-label">{label}</span>
      <span className="vb-metric-value"><NumberRoller value={value} format={fmt} label={`${fmt(value)}${unit === '%' ? '' : ' '}${unit}`} /><small aria-hidden="true">{unit}</small></span>
      <span className="vb-metric-foot">{foot}</span>
    </li>
  );
}

function BoardMetrics({ kind, d }: { kind: string; d: Derived }) {
  const W = (v: number) => wan(v);
  const P = (v: number) => pctNumber(v);
  const open = d.bills.filter(b => b.unpaid > 0).length;
  let tiles: ReactNode;
  if (kind === 'operations') {
    tiles = <>
      <Tile label="年度目标" value={d.business.target} fmt={W} unit="万元" foot={`${d.models.length} 个型号合计`} />
      <Tile label="已确认收入" value={d.business.revenue} fmt={W} unit="万元" foot={`完成 ${pct(d.business.completion)}`} />
      <Tile label="回款率" value={d.business.receivedRate} fmt={P} unit="%" foot={`已回款 ${wanLabel(d.business.received)}`} />
      <Tile label="距目标" value={d.business.gap} fmt={W} unit="万元" foot={`待回款 ${wanLabel(d.business.revenue - d.business.received)}`} />
    </>;
  } else if (kind === 'contracts') {
    tiles = <>
      <Tile label="合同金额" value={d.spend.contractAmount} fmt={W} unit="万元" foot={`${d.spend.contractCount} 份合同`} />
      <Tile label="已报账" value={d.spend.billed} fmt={W} unit="万元" foot={`${d.spend.billCount} 张单据`} />
      <Tile label="付款比例" value={d.spend.payRate} fmt={P} unit="%" foot={`已付 ${wanLabel(d.spend.paid)}`} />
      <Tile label="待付款" value={d.spend.unpaid} fmt={W} unit="万元" foot={`${open} 张未付清`} />
    </>;
  } else {
    tiles = <>
      <Tile label="报账金额" value={d.spend.billed} fmt={W} unit="万元" foot={`${d.bySystem.length} 个分系统`} />
      <Tile label="已付款" value={d.spend.paid} fmt={W} unit="万元" foot={`付款 ${d.spend.paymentCount} 笔`} />
      <Tile label="付款比例" value={d.spend.payRate} fmt={P} unit="%" foot={`待付 ${wanLabel(d.spend.unpaid)}`} />
      <Tile label="单据" value={d.spend.billCount} fmt={v => int(v)} unit="张" foot={`${open} 张未付清`} />
    </>;
  }
  return <section aria-label="关键指标"><ul className="vb-tiles">{tiles}</ul></section>;
}

/* ───────── 三种看板的图 ───────── */

type ChartProps = { d: Derived; fOf: (id: string) => string | null; isFlash: (id: string) => boolean };

function OperationsCharts({ d, fOf, isFlash }: ChartProps) {
  const colorOf = useModelColor();
  const series = d.models.map(m => ({ key: m.id, label: m.id, color: colorOf(m.id), values: m.monthly, area: d.models.length === 1 }));
  const peak = [...d.monthlyRevenue].sort((a, b) => b.total - a.total)[0];
  return (
    <>
      <ChartCard id="ops-trend" className="is-main" flash={isFlash('ops-trend')} eyebrow="主图 · 月度趋势" title="各型号月度收入"
        note={peak ? `${peak.label}收入合计最高，为 ${wanLabel(peak.total)}。单位万元。` : '当前筛选下没有收入数据。'}
        legend={series.map(s => ({ label: s.label, color: s.color, kind: 'line' as const }))}
        table={<DataTable caption="各型号月度收入（万元）" columns={[{ key: 'm', label: '月份' }, ...d.models.map(m => ({ key: m.id, label: m.id, num: true })), { key: 't', label: '合计', num: true }]}
          rows={d.monthlyRevenue.map(p => ({ m: p.label, ...Object.fromEntries(d.models.map(m => [m.id, wan(p.byModel[m.id] ?? 0)])), t: wan(p.total) }))} />}>
        {d.months.length ? (
          <LineChart labels={d.monthLabels} keys={d.months} series={series} height={300} glow fmt={v => wanLabel(v)} axisFmt={v => wan(v, 0)} focus={fOf('ops-trend')}
            ariaLabel={`各型号月度收入折线图，${d.models.map(m => `${m.id} 合计 ${wanLabel(m.monthly.reduce((a, b) => a + b, 0))}`).join('，')}`} />
        ) : <p className="vb-empty">当前期间没有月度收入。</p>}
      </ChartCard>
      <div className="vb-board-pair">
        <ChartCard id="ops-target" flash={isFlash('ops-target')} eyebrow="辅图 · 目标完成" title="目标、收入与回款"
          note="颜色对应型号：浅灰轨道是年度目标，半透明是收入，实色是回款。"
          legend={[{ label: '目标', color: 'var(--vb-track)', kind: 'bar' }, { label: '收入', color: 'var(--vb-layer-1)', kind: 'bar' }, { label: '回款', color: 'var(--vb-layer-2)', kind: 'bar' }]}>
          <HBars focus={fOf('ops-target')} ariaLabel={`各型号目标完成：${d.models.map(m => `${m.id} ${pct(m.completion)}`).join('，')}`}
            items={d.models.map(m => ({ key: m.id, label: <><ModelDot id={m.id} />{m.id}</>, value: m.revenue, inner: m.received, track: m.target, color: colorOf(m.id), display: pct(m.completion),
              detail: <>目标 {wan(m.target)} · 收入 {wan(m.revenue)} · 回款 {wan(m.received)} 万元</> }))} />
        </ChartCard>
        <ChartCard id="ops-recv" flash={isFlash('ops-recv')} eyebrow="辅图 · 回款" title={`回款率 ${pct(d.business.receivedRate)}`} note="每一圈是一个型号的回款 ÷ 收入。">
          <Rings size={190} focus={fOf('ops-recv')} centerValue={pct(d.business.receivedRate)} centerLabel="整体回款率"
            ariaLabel={`各型号回款率环形图：${d.models.map(m => `${m.id} ${pct(m.receivedRate)}`).join('，')}`}
            items={d.models.map(m => ({ key: m.id, label: m.id, ratio: m.receivedRate, color: colorOf(m.id), display: pct(m.receivedRate), detail: `${wan(m.received)} / ${wan(m.revenue)} 万元` }))} />
        </ChartCard>
      </div>
    </>
  );
}

function ContractsCharts({ d, fOf, isFlash }: ChartProps) {
  const nodeColor = (n: FlowNode) => (n.id === 'st:paid' ? 'var(--vb-ok)' : n.id === 'st:unpaid' ? 'var(--vb-warn)' : n.id === 'c:none' ? 'var(--vb-node)' : 'var(--accent)');
  return (
    <>
      <ChartCard id="ctr-main" className="is-main" flash={isFlash('ctr-main')} eyebrow="主图 · 合同履约" title="每份合同的报账与付款"
        note="浅色轨道是合同额，半透明是已报账，实色是已付款；右侧是按合同额算的付款进度。"
        legend={[{ label: '合同额', color: 'var(--vb-track)', kind: 'bar' }, { label: '已报账', color: 'rgb(var(--accent-rgb) / .35)', kind: 'bar' }, { label: '已付款', color: 'var(--accent)', kind: 'bar' }]}
        table={<DataTable caption="合同履约（万元）" columns={[{ key: 'n', label: '合同' }, { key: 'a', label: '合同额', num: true }, { key: 'b', label: '已报账', num: true }, { key: 'p', label: '已付款', num: true }, { key: 'r', label: '付款进度', num: true }]}
          rows={d.contracts.map(c => ({ n: c.name, a: wan(c.amount), b: wan(c.billed), p: wan(c.paid), r: pct(c.payRate) }))} />}>
        {d.contracts.length ? (
          <HBars focus={fOf('ctr-main')} ariaLabel={`合同履约条形图：${d.contracts.map(c => `${c.name} 付款进度 ${pct(c.payRate)}`).join('，')}`}
            items={d.contracts.map(c => ({ key: c.id, label: <span className="vb-hb-two"><b>{c.name}</b><small>{c.id} · {c.unit}</small></span>, value: c.billed, inner: c.paid, track: c.amount, color: 'var(--accent)', display: pct(c.payRate),
              detail: <>合同 {wan(c.amount)} · 报账 {wan(c.billed)} · 已付 {wan(c.paid)} 万元</> }))} />
        ) : <p className="vb-empty">当前筛选下没有关联合同。</p>}
      </ChartCard>
      <div className="vb-board-pair">
        <ChartCard id="ctr-flow" flash={isFlash('ctr-flow')} eyebrow="辅图 · 资金流向" title="报账流向已付与待付" note="左侧是合同（或无合同的院内支出），右侧是付款状态。">
          <Sankey nodes={d.contractFlow.nodes} links={d.contractFlow.links} height={260} nodeColor={nodeColor} fmt={v => wan(v)} focus={fOf('ctr-flow')}
            ariaLabel={`合同资金流向：已付款 ${wanLabel(d.spend.paid)}，待付款 ${wanLabel(d.spend.unpaid)}`} />
        </ChartCard>
        <ChartCard id="ctr-status" eyebrow="辅图 · 付款状态" title="单据付款状态" note="按单据数和金额统计。">
          <StatusBars d={d} />
        </ChartCard>
      </div>
    </>
  );
}

const STATUS_ICON: Record<PaymentStatus, ReactNode> = {
  '已付清': <CheckCircleIcon size={16} weight="fill" aria-hidden="true" />,
  '部分付款': <CircleHalfIcon size={16} weight="fill" aria-hidden="true" />,
  '未付款': <CircleIcon size={16} weight="bold" aria-hidden="true" />,
};

export function StatusBadge({ s }: { s: PaymentStatus }) {
  return <span className={`vb-status-badge ${STATUS_CLASS[s]}`}>{STATUS_ICON[s]}{s}</span>;
}

function StatusBars({ d }: { d: Derived }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...d.byStatus.map(s => s.amount));
  return (
    <ul className="vb-statusbars" aria-label={`付款状态：${d.byStatus.map(s => `${s.status} ${s.count} 张 ${wanLabel(s.amount)}`).join('，')}`} onPointerLeave={() => setHover(null)}>
      {d.byStatus.map((s, i) => (
        <li key={s.status} className={`${STATUS_CLASS[s.status]}${hover !== null && hover !== i ? ' is-dim' : ''}`} onPointerEnter={() => setHover(i)}>
          <StatusBadge s={s.status} />
          <span className="vb-statusbars-track"><i style={{ width: `${(s.amount / max) * 100}%` }} /></span>
          <span className="vb-statusbars-val"><b>{s.count} 张</b><small>{wanLabel(s.amount)}</small></span>
        </li>
      ))}
    </ul>
  );
}

function ExpensesCharts({ d, fOf, isFlash }: ChartProps) {
  const deptColors = ['var(--accent)', 'rgb(var(--accent-rgb) / .62)', 'rgb(var(--accent-rgb) / .38)', 'rgb(var(--accent-rgb) / .22)', 'var(--vb-node)'];
  const total = d.spend.billed || 1;
  return (
    <>
      <ChartCard id="exp-main" className="is-main" flash={isFlash('exp-main')} eyebrow="主图 · 月度支出" title="每月报账与已付款"
        note={`共 ${d.spend.billCount} 张单据，报账 ${wanLabel(d.spend.billed)}，已付 ${pct(d.spend.payRate)}。单位万元。`}
        legend={[{ label: '报账', color: 'var(--accent)', kind: 'bar' }, { label: '已付款', color: 'var(--vb-ok)', kind: 'bar' }]}
        table={<DataTable caption="每月报账与已付款（万元）" columns={[{ key: 'm', label: '月份' }, { key: 'b', label: '报账', num: true }, { key: 'p', label: '已付款', num: true }, { key: 'r', label: '付款比例', num: true }]}
          rows={d.billsByMonth.map(x => ({ m: x.label, b: wan(x.billed), p: wan(x.paid), r: pct(x.billed ? x.paid / x.billed : 0) }))} />}>
        {d.billsByMonth.length ? (
          <BarChart labels={d.billsByMonth.map(x => x.label)} keys={d.billsByMonth.map(x => x.month)} height={290} focus={fOf('exp-main')}
            series={[{ key: 'b', label: '报账', color: 'var(--accent)', values: d.billsByMonth.map(x => x.billed) }, { key: 'p', label: '已付款', color: 'var(--vb-ok)', values: d.billsByMonth.map(x => x.paid) }]}
            fmt={v => wanLabel(v)} axisFmt={v => wan(v, 0)} ariaLabel={`每月报账与已付款柱状图：${d.billsByMonth.map(x => `${x.label} 报账 ${wanLabel(x.billed)}`).join('，')}`} />
        ) : <p className="vb-empty">当前筛选下没有报账单。</p>}
      </ChartCard>
      <div className="vb-board-pair">
        <ChartCard id="exp-system" flash={isFlash('exp-system')} eyebrow="辅图 · 分系统" title="分系统报账" note="半透明是报账，实色是已付款。"
          legend={[{ label: '报账', color: 'rgb(var(--accent-rgb) / .35)', kind: 'bar' }, { label: '已付款', color: 'var(--accent)', kind: 'bar' }]}>
          <HBars focus={fOf('exp-system')} ariaLabel={`分系统报账：${d.bySystem.map(g => `${g.key} ${wanLabel(g.billed)}`).join('，')}`}
            items={d.bySystem.map(g => ({ key: g.key, label: g.key, value: g.billed, inner: g.paid, color: 'var(--accent)', display: wan(g.billed), detail: <>{g.count} 张 · 已付 {wan(g.paid)} 万元 · {pct(g.billed ? g.paid / g.billed : 0)}</> }))} />
        </ChartCard>
        <ChartCard id="exp-dept" flash={isFlash('exp-dept')} eyebrow="辅图 · 部门" title="部门报账占比" note="悬停扇区看占比。">
          <Donut size={180} focus={fOf('exp-dept')} centerValue={wan(d.spend.billed)} centerLabel="报账（万元）"
            ariaLabel={`部门报账占比：${d.byDept.map(g => `${g.key} ${pct(g.billed / total)}`).join('，')}`}
            items={d.byDept.map((g, i) => ({ key: g.key, label: g.key, value: g.billed, color: deptColors[i % deptColors.length], display: wan(g.billed), share: pct(g.billed / total) }))} />
        </ChartCard>
      </div>
    </>
  );
}

/* ───────── 明细表 ───────── */

function BillsTable({ d, onOpen, flash }: { d: Derived; onOpen: (b: BillRow) => void; flash: boolean }) {
  return (
    <section id="bills" className={`vb-card vb-bills${flash ? ' is-flash' : ''}`} aria-labelledby="vb-bills-t">
      <header className="vb-card-head">
        <div className="vb-card-titles">
          <span className="vb-eyebrow">明细</span>
          <h3 id="vb-bills-t">报账单</h3>
          <p className="vb-card-note">点一行查看这张单据的付款链路：合同 → 报账 → 付款。</p>
        </div>
      </header>
      {d.bills.length === 0 ? <p className="vb-empty">当前筛选下没有报账单。</p> : (
        <div className="vb-table-wrap">
          <table className="vb-table">
            <caption className="vb-sr">报账单明细，共 {d.bills.length} 张</caption>
            <thead>
              <tr>
                <th scope="col">单据</th><th scope="col">日期</th><th scope="col">型号</th><th scope="col">分系统</th><th scope="col">摘要</th>
                <th scope="col" className="is-num">金额（万元）</th><th scope="col" className="is-num">已付</th><th scope="col">状态</th>
              </tr>
            </thead>
            <tbody>
              {d.bills.map(b => (
                <tr key={b.id} onClick={() => onOpen(b)}>
                  <th scope="row"><button type="button" className="vb-row-btn" data-bill={b.id} onClick={e => { e.stopPropagation(); onOpen(b); }} aria-label={`查看 ${b.id} 的付款链路`}>{b.id}</button></th>
                  <td>{dayLabel(b.date)}</td>
                  <td><span className="vb-model"><ModelDot id={b.model} />{b.model}</span></td>
                  <td>{b.system}</td>
                  <td className="vb-td-sum">{b.summary}</td>
                  <td className="is-num">{wan(b.amount)}</td>
                  <td className="is-num">{wan(b.paid)}</td>
                  <td><StatusBadge s={b.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ───────── 付款链路抽屉 ───────── */

function ChainDrawer({ bill, onClose }: { bill: BillRow; onClose: () => void }) {
  const { data, derived: all } = useSite();
  const contract = bill.contractId ? all.contracts.find(c => c.id === bill.contractId) ?? null : null;
  const panel = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const colorOf = useModelColor();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab' && panel.current) {
        const f = [...panel.current.querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])')];
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const ov = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = ov;
      const back = prev && prev !== document.body ? prev : document.querySelector<HTMLElement>(`[data-bill="${bill.id}"]`);
      back?.focus?.({ preventScroll: true });
    };
  }, [bill.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const ratio = bill.amount ? bill.paid / bill.amount : 0;
  // 渲染到 .vb-root 下：.vb-board 自带层叠上下文（z-index:1），留在里面会被导航和方案切换条盖住
  const host = document.querySelector('.vb-root') ?? document.body;
  return createPortal(
    <div className="vb-drawer-layer">
      <button type="button" className="vb-drawer-scrim" aria-label="关闭付款链路" onClick={onClose} tabIndex={-1} />
      <div ref={panel} className="vb-drawer" role="dialog" aria-modal="true" aria-labelledby="vb-drawer-t">
        <header className="vb-drawer-head">
          <div>
            <span className="vb-eyebrow">付款链路</span>
            <h2 id="vb-drawer-t">{bill.id}</h2>
          </div>
          <button ref={closeBtn} type="button" className="vb-icon-btn" onClick={onClose} aria-label="关闭"><XIcon size={18} /></button>
        </header>
        <div className="vb-drawer-body">
          <div className="vb-chain-progress">
            <div><span>已付 {pct(ratio)}</span><b>{wan(bill.paid)} / {wan(bill.amount)} 万元</b></div>
            <span className="vb-meter"><i style={{ width: `${Math.min(100, ratio * 100)}%` }} /></span>
          </div>
          <ol className="vb-chain">
            <li className="vb-chain-step" style={{ ['--i' as string]: 0 }}>
              <span className="vb-chain-node" aria-hidden="true">合</span>
              <div className="vb-chain-card">
                <span className="vb-chain-k">合同</span>
                {contract ? <>
                  <strong>{contract.name}</strong>
                  <span className="vb-chain-meta">{contract.id} · {contract.unit}</span>
                  <dl className="vb-chain-dl">
                    <div><dt>合同额</dt><dd>{wanLabel(contract.amount)}</dd></div>
                    <div><dt>签订</dt><dd>{dayLabel(contract.signed)}</dd></div>
                    <div><dt>合同付款进度</dt><dd>{pct(contract.payRate)}</dd></div>
                  </dl>
                </> : <>
                  <strong>院内支出</strong>
                  <span className="vb-chain-meta">这张单据没有关联合同。</span>
                </>}
              </div>
            </li>
            <li className="vb-chain-step" style={{ ['--i' as string]: 1 }}>
              <span className="vb-chain-node is-accent" aria-hidden="true">报</span>
              <div className="vb-chain-card">
                <span className="vb-chain-k">报账</span>
                <strong>{bill.summary}</strong>
                <span className="vb-chain-meta">{dayLabel(bill.date)} · <span className="vb-model"><i className="vb-sw is-dot" style={{ background: colorOf(bill.model) }} aria-hidden="true" />{bill.model}</span> · {bill.system} · {bill.component}</span>
                <dl className="vb-chain-dl">
                  <div><dt>金额</dt><dd>{wanLabel(bill.amount)}</dd></div>
                  <div><dt>部门</dt><dd>{bill.dept}</dd></div>
                  <div><dt>科目 / 凭证</dt><dd>{bill.subject} · {bill.voucher}</dd></div>
                  <div><dt>状态</dt><dd><StatusBadge s={bill.status} /></dd></div>
                </dl>
              </div>
            </li>
            {bill.payments.map((p, i) => (
              <li key={p.id} className="vb-chain-step" style={{ ['--i' as string]: 2 + i }}>
                <span className="vb-chain-node is-ok" aria-hidden="true">付</span>
                <div className="vb-chain-card is-pay">
                  <span className="vb-chain-k">付款 {i + 1}</span>
                  <strong>{wanLabel(p.amount)}</strong>
                  <span className="vb-chain-meta">{dayLabel(p.date)} · {p.id} · {p.account}</span>
                </div>
              </li>
            ))}
            {bill.unpaid > 0 && (
              <li className="vb-chain-step is-pending" style={{ ['--i' as string]: 2 + bill.payments.length }}>
                <span className="vb-chain-node is-wait" aria-hidden="true">待</span>
                <div className="vb-chain-card is-pay">
                  <span className="vb-chain-k">待付款</span>
                  <strong>{wanLabel(bill.unpaid)}</strong>
                  <span className="vb-chain-meta">{bill.payments.length ? '还有余款未付。' : '这张单据还没有付款记录。'}</span>
                </div>
              </li>
            )}
          </ol>
          <p className="vb-drawer-note">{data.meta.note}</p>
        </div>
      </div>
    </div>,
    host,
  );
}

/* ───────── 未找到 ───────── */

function NotFound({ route, assetId }: { route: Route; assetId: string }) {
  const { data } = useSite();
  return (
    <main id="vb-main" className="vb-404" tabIndex={-1}>
      <OrbCss />
      <span className="vb-eyebrow">404</span>
      <h1>没有找到这个看板</h1>
      <p>地址里的「{assetId}」不在资产清单里。可能是链接写错了，或者这个看板还在筹备中。</p>
      <a className="vb-btn is-primary" href={bHref(route)}><ArrowLeftIcon size={16} aria-hidden="true" />返回首页</a>
      <ul className="vb-404-list" aria-label="现有看板">
        {data.assets.map(a => <li key={a.id}><a className="vb-link" href={bHref(route, 'board', a.id)}>{a.name}</a></li>)}
      </ul>
    </main>
  );
}
