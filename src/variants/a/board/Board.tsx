import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, RotateCcw, X } from 'lucide-react';
import { useDerived, useSite } from '../../../core/provider';
import { useSpotlight } from '../../../core/fx/hooks';
import type { Route } from '../../../core/route';
import type { Asset } from '../../../core/data/types';
import type { FlowNode } from '../../../core/data/derive';
import { dateTimeLabel, pct, pctNumber, wan, wanLabel } from '../../../core/data/format';
import { ChartCard, DataTable } from '../charts/kit';
import { TimeChart } from '../charts/TimeChart';
import { FlowGraph } from '../charts/FlowGraph';
import { HBars, Ring, VBars } from '../charts/Bars';
import { GaugePanel } from '../charts/Gauge';
import { link, useModelColor, StatusBadge, clamp, Roll } from '../lib';
import { BillTable } from './BillTable';
import { ChainDrawer } from './ChainDrawer';

type Kind = 'contracts' | 'expenses' | 'operations';

const kindOf = (a: Asset): Kind =>
  a.id === 'contracts' || a.id === 'expenses' || a.id === 'operations' ? a.id : a.domain === 'business' ? 'operations' : a.category.includes('合同') ? 'contracts' : 'expenses';

interface Kpi { code: string; label: string; value: number; kind: 'wan' | 'pct' | 'int'; sub: ReactNode; tone?: 'signal' }

function KpiRow({ items }: { items: Kpi[] }) {
  return (
    <ul className="va-kpis" aria-label="指标">
      {items.map(k => (
        <li key={k.code} className={`va-kpi va-cross${k.tone === 'signal' ? ' is-signal' : ''}`}>
          <span className="va-mono">{k.code}</span>
          <h3>{k.label}</h3>
          <p className="va-kpi-value">
            {k.kind === 'wan' && <><Roll value={k.value} format={n => wan(n)} label={wanLabel(k.value)} /><small>万元</small></>}
            {k.kind === 'pct' && <><Roll value={Math.round(k.value * 1000)} format={n => pctNumber(n / 1000)} label={pct(k.value)} /><small>%</small></>}
            {k.kind === 'int' && <Roll value={k.value} format={n => String(n)} />}
          </p>
          <p className="va-kpi-sub">{k.sub}</p>
        </li>
      ))}
    </ul>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="va-select">
      <span className="va-mono">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function Board({ route, asset }: { route: Route; asset: Asset }) {
  const { data, derived: all } = useSite();
  const color = useModelColor();
  const kind = kindOf(asset);
  const domain = data.domains.find(d => d.id === asset.domain);

  const [models, setModels] = useState<string[]>([]);
  const [period, setPeriod] = useState('all');
  const [system, setSystem] = useState('all');
  const [dept, setDept] = useState('all');
  const [contract, setContract] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  // 从网址读入初始筛选（检索跳转用），切换资产时重置
  useEffect(() => {
    const q = route.query;
    const m = q.get('model');
    setModels(m && all.options.models.includes(m) ? [m] : []);
    setPeriod('all'); setSystem('all'); setDept('all');
    const c = q.get('contract');
    setContract(c && data.contracts.some(x => x.id === c) ? c : null);
    const b = q.get('bill');
    setOpenId(b && all.bills.some(x => x.id === b) ? b : null);
  }, [asset.id, route.query.toString()]); // eslint-disable-line react-hooks/exhaustive-deps

  const d = useDerived({ models, period, systems: system === 'all' ? [] : [system], depts: dept === 'all' ? [] : [dept] });
  const rows = useMemo(() => (contract ? d.bills.filter(b => b.contractId === contract) : d.bills), [d.bills, contract]);
  const openBill = openId ? all.bills.find(b => b.id === openId) ?? null : null;
  const dirty = models.length > 0 || period !== 'all' || system !== 'all' || dept !== 'all' || !!contract;
  const reset = () => { setModels([]); setPeriod('all'); setSystem('all'); setDept('all'); setContract(null); };
  const toggleModel = (id: string) => setModels(ms => (ms.includes(id) ? ms.filter(x => x !== id) : [...ms, id]));

  const grid = useRef<HTMLDivElement>(null);
  useSpotlight(grid, true);

  const unpaidCount = d.byStatus.filter(s => s.status !== '已付清').reduce((s, x) => s + x.count, 0);
  const cBilled = d.contracts.reduce((s, c) => s + c.billed, 0), cPaid = d.contracts.reduce((s, c) => s + c.paid, 0);
  const cAmount = d.spend.contractAmount;

  let kpis: Kpi[] = [];
  if (kind === 'contracts') kpis = [
    { code: 'CTR · AMOUNT', label: '合同总额', value: cAmount, kind: 'wan', sub: `${d.spend.contractCount} 份合同` },
    { code: 'CTR · BILLED', label: '合同内报账', value: cBilled, kind: 'wan', sub: `占合同额 ${pct(cAmount ? cBilled / cAmount : 0)}` },
    { code: 'PAID', label: '已付款', value: d.spend.paid, kind: 'wan', sub: `${d.spend.paymentCount} 笔付款` },
    { code: 'PAY RATE', label: '付款率', value: d.spend.payRate, kind: 'pct', sub: `合同履约 ${pct(cAmount ? cPaid / cAmount : 0)}` },
    { code: 'PENDING', label: '待付款', value: d.spend.unpaid, kind: 'wan', sub: `${unpaidCount} 张未付清`, tone: 'signal' },
  ];
  else if (kind === 'expenses') kpis = [
    { code: 'BILLED', label: '报账金额', value: d.spend.billed, kind: 'wan', sub: `${d.spend.billCount} 张报账单` },
    { code: 'PAID', label: '已付款', value: d.spend.paid, kind: 'wan', sub: `付款率 ${pct(d.spend.payRate)}` },
    { code: 'PENDING', label: '待付款', value: d.spend.unpaid, kind: 'wan', sub: `${unpaidCount} 张未付清`, tone: 'signal' },
    { code: 'TOP · SUBSYS', label: '最大支出分系统', value: d.bySystem[0]?.billed ?? 0, kind: 'wan', sub: d.bySystem[0] ? `${d.bySystem[0].key} · 占 ${pct(d.spend.billed ? d.bySystem[0].billed / d.spend.billed : 0)}` : '—' },
    { code: 'AVG / BILL', label: '单张平均', value: d.spend.billCount ? Math.round(d.spend.billed / d.spend.billCount) : 0, kind: 'wan', sub: `${d.byDept.length} 个部门` },
  ];
  else {
    const lastM = d.monthlyRevenue[d.monthlyRevenue.length - 1];
    kpis = [
      { code: 'TARGET', label: '年度目标', value: d.business.target, kind: 'wan', sub: `${d.models.length} 个型号` },
      { code: 'REVENUE', label: '实际收入', value: d.business.revenue, kind: 'wan', sub: `完成 ${pct(d.business.completion)}` },
      { code: 'RECEIVED', label: '回款金额', value: d.business.received, kind: 'wan', sub: `回款率 ${pct(d.business.receivedRate)}` },
      { code: 'GAP', label: '目标缺口', value: d.business.gap, kind: 'wan', sub: `还差 ${pct(d.business.target ? d.business.gap / d.business.target : 0)}`, tone: 'signal' },
      { code: 'LAST MONTH', label: lastM ? `${lastM.label}收入` : '最近一月收入', value: lastM?.total ?? 0, kind: 'wan', sub: `所选期间 ${d.months.length} 个月` },
    ];
  }

  const ready = d.bills.length > 0 || kind === 'operations';

  // —— 主图 / 辅图 ——
  let main: ReactNode = null, side: ReactNode = null, extra: ReactNode = null;
  if (kind === 'contracts') {
    const nodeColor = (n: FlowNode) => n.kind === 'model' ? color(n.label) : n.id === 'st:paid' ? 'var(--accent)' : n.id === 'st:unpaid' ? 'var(--va-signal)' : 'var(--va-ink-2)';
    const linkColor = (s: FlowNode, t: FlowNode) => s.kind === 'model' ? color(s.label) : t.id === 'st:unpaid' ? 'var(--va-signal)' : 'var(--accent)';
    const nameOf = (id: string) => d.flow.nodes.find(n => n.id === id)?.label ?? id;
    main = (
      <ChartCard className="va-bd-main" code="FIG.A · FUND FLOW" title="资金流向" desc="型号 → 分系统 → 已付 / 待付，线宽对应金额，流光方向即资金方向"
        legend={[...d.byModel.map(g => ({ label: g.key, color: color(g.key) })), { label: '已付款', color: 'var(--accent)' }, { label: '待付款', color: 'var(--va-signal)' }]}
        table={<DataTable caption="资金流向明细" rowKey={r => `${r.source}|${r.target}`} rows={d.flow.links}
          columns={[{ key: 's', label: '来源', render: r => nameOf(r.source) }, { key: 't', label: '去向', render: r => nameOf(r.target) }, { key: 'v', label: '金额（万元）', align: 'right', render: r => wan(r.value) }, { key: 'p', label: '占报账', align: 'right', render: r => pct(d.spend.billed ? r.value / d.spend.billed : 0) }]} />}>
        {d.flow.links.length
          ? <FlowGraph nodes={d.flow.nodes} links={d.flow.links} height={360} columnTitles={['MODEL 型号', 'SUBSYSTEM 分系统', 'STATUS 付款']}
              ariaLabel={`资金流向：报账 ${wanLabel(d.spend.billed)}，已付 ${wanLabel(d.spend.paid)}，待付 ${wanLabel(d.spend.unpaid)}`}
              nodeColor={nodeColor} linkColor={linkColor} />
          : <p className="va-empty">当前筛选没有资金流向。</p>}
      </ChartCard>
    );
    const maxAmt = Math.max(1, ...d.contracts.map(c => c.amount));
    side = (
      <ChartCard className="va-bd-side" code="FIG.B · FULFILMENT" title="合同履约" desc="底条为合同额，中间为已报账，实心为已付款"
        legend={[{ label: '合同额', color: 'rgb(var(--va-ink-rgb) / .1)' }, { label: '已报账', color: 'rgb(var(--accent-rgb) / .42)' }, { label: '已付款', color: 'var(--accent)' }]}>
        {d.contracts.length ? (
          <HBars rows={d.contracts.map(c => ({ key: c.id, label: c.name, values: [c.amount, c.billed, c.paid] }))} max={maxAmt}
            series={[{ id: 'amt', label: '合同额', color: 'var(--va-ink-1)', mix: 9 }, { id: 'billed', label: '已报账', color: 'var(--accent)', mix: 42 }, { id: 'paid', label: '已付款', color: 'var(--accent)' }]}
            valueText={r => `${wan(r.values[2])} / ${wan(r.values[0])} 万元`}
            rowNote={r => `报账 ${pct(r.values[1] / (r.values[0] || 1))} · 付款 ${pct(r.values[2] / (r.values[0] || 1))}`}
            ariaLabel={`合同履约：${d.contracts.map(c => `${c.name}付款 ${pct(c.payRate)}`).join('，')}`} />
        ) : <p className="va-empty">当前筛选没有关联合同。</p>}
      </ChartCard>
    );
    extra = (
      <>
        <ChartCard className="va-bd-half" code="FIG.C · STATUS" title="付款状态" desc="按报账金额统计">
          <Ring centerLabel="报账合计" ariaLabel={`付款状态：${d.byStatus.map(s => `${s.status} ${s.count} 张`).join('，')}`}
            items={d.byStatus.filter(s => s.amount > 0).map(s => ({ key: s.status, label: `${s.status} · ${s.count} 张`, value: s.amount, color: s.status === '已付清' ? 'var(--va-ok)' : s.status === '部分付款' ? 'var(--va-warn)' : 'var(--va-bad)' }))} />
        </ChartCard>
        <ChartCard className="va-bd-half" code="FIG.D · BY MODEL" title="按型号报账" desc="颜色为型号色，浅色为报账，实心为已付款"
          legend={[...d.byModel.map(g => ({ label: g.key, color: color(g.key) })), { label: '报账（浅色）', color: 'rgb(var(--va-ink-rgb) / .18)' }, { label: '已付款（实心）', color: 'var(--va-ink-2)' }]}>
          <HBars rows={d.byModel.map(g => ({ key: g.key, label: g.key, sub: `${g.count} 张`, values: [g.billed, g.paid], color: color(g.key) }))}
            series={[{ id: 'b', label: '报账', color: 'var(--accent)', mix: 30 }, { id: 'p', label: '已付款', color: 'var(--accent)' }]}
            rowNote={r => `付款率 ${pct(r.values[1] / (r.values[0] || 1))}`}
            ariaLabel={`按型号报账：${d.byModel.map(g => `${g.key} ${wanLabel(g.billed)}`).join('，')}`} />
        </ChartCard>
      </>
    );
  } else if (kind === 'expenses') {
    main = (
      <ChartCard className="va-bd-main" code="FIG.A · MONTHLY" title="月度支出" desc="按报账月份统计，已付款按报账单归月"
        legend={[{ label: '报账', color: 'rgb(var(--accent-rgb) / .38)' }, { label: '已付款', color: 'var(--accent)' }]}
        table={<DataTable caption="月度支出" rowKey={r => r.month} rows={d.billsByMonth}
          columns={[{ key: 'm', label: '月份', render: r => r.label }, { key: 'b', label: '报账（万元）', align: 'right', render: r => wan(r.billed) }, { key: 'p', label: '已付（万元）', align: 'right', render: r => wan(r.paid) }, { key: 'r', label: '付款率', align: 'right', render: r => pct(r.billed ? r.paid / r.billed : 0) }]} />}>
        {d.billsByMonth.length
          ? <VBars labels={d.billsByMonth.map(m => m.label)} values={[d.billsByMonth.map(m => m.billed), d.billsByMonth.map(m => m.paid)]} height={340}
              series={[{ id: 'b', label: '报账', color: 'var(--accent)', mix: 38 }, { id: 'p', label: '已付款', color: 'var(--accent)' }]}
              ariaLabel={`月度支出柱图：${d.billsByMonth.map(m => `${m.label}报账 ${wanLabel(m.billed)}`).join('，')}`} />
          : <p className="va-empty">当前筛选没有报账。</p>}
      </ChartCard>
    );
    side = (
      <ChartCard className="va-bd-side" code="FIG.B · SUBSYSTEM" title="分系统支出" desc="浅色为报账，实心为已付款"
        legend={[{ label: '报账', color: 'rgb(var(--accent-rgb) / .3)' }, { label: '已付款', color: 'var(--accent)' }]}>
        <HBars rows={d.bySystem.map(g => ({ key: g.key, label: g.key, sub: `${g.count} 张`, values: [g.billed, g.paid] }))}
          series={[{ id: 'b', label: '报账', color: 'var(--accent)', mix: 28 }, { id: 'p', label: '已付款', color: 'var(--accent)' }]}
          rowNote={r => `付款率 ${pct(r.values[1] / (r.values[0] || 1))}`}
          ariaLabel={`分系统支出：${d.bySystem.map(g => `${g.key} ${wanLabel(g.billed)}`).join('，')}`} />
      </ChartCard>
    );
    const units = new Map<string, number>();
    d.bills.forEach(b => units.set(b.unit, (units.get(b.unit) ?? 0) + b.amount));
    const topUnits = [...units.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const deptMix = [100, 62, 34, 20];
    extra = (
      <>
        <ChartCard className="va-bd-half" code="FIG.C · BY DEPT" title="部门构成" desc="按报账金额">
          <Ring centerLabel="报账合计" ariaLabel={`部门构成：${d.byDept.map(g => `${g.key} ${wanLabel(g.billed)}`).join('，')}`}
            items={d.byDept.map((g, i) => ({ key: g.key, label: g.key, value: g.billed, color: `color-mix(in srgb, var(--accent) ${deptMix[i % deptMix.length]}%, var(--va-surface-2))` }))} />
        </ChartCard>
        <ChartCard className="va-bd-half" code="FIG.D · COUNTERPARTY" title="往来单位前五" desc="按报账金额">
          <HBars rows={topUnits.map(([u, v]) => ({ key: u, label: u, values: [v] }))}
            series={[{ id: 'v', label: '报账', color: 'var(--va-m2)' }]}
            ariaLabel={`往来单位前五：${topUnits.map(([u, v]) => `${u} ${wanLabel(v)}`).join('，')}`} />
        </ChartCard>
      </>
    );
  } else {
    const series = d.models.map(m => ({ id: m.id, label: m.id, color: color(m.id), values: m.monthly }));
    main = (
      <ChartCard className="va-bd-main" code="FIG.A · MONTHLY REVENUE" title="月度收入趋势" desc="各型号月度收入堆叠，悬停查看当月构成"
        legend={d.models.map(m => ({ label: m.id, color: color(m.id) }))}
        table={<DataTable caption="月度收入（万元）" rowKey={r => r.month} rows={d.monthlyRevenue}
          columns={[{ key: 'm', label: '月份', render: r => r.label }, ...d.models.map(m => ({ key: m.id, label: m.id, align: 'right' as const, render: (r: { byModel: Record<string, number> }) => wan(r.byModel[m.id] ?? 0) })), { key: 't', label: '合计', align: 'right', render: r => wan(r.total) }]} />}>
        {d.monthlyRevenue.length
          ? <TimeChart labels={d.monthLabels} series={series} mode="stack" height={340} totalLabel="当月合计" endLabel={v => `${wanLabel(v, 0)}`}
              ariaLabel={`月度收入堆叠面积图：${d.monthlyRevenue.map(m => `${m.label} ${wanLabel(m.total)}`).join('，')}`} />
          : <p className="va-empty">所选期间没有月度收入。</p>}
      </ChartCard>
    );
    side = (
      <ChartCard className="va-bd-side" code="FIG.B · TARGET" title="目标 · 收入 · 回款" desc="颜色为型号色：底条为目标，中间为收入，实心为回款"
        legend={[...d.models.map(m => ({ label: m.id, color: color(m.id) })), { label: '目标（底条）', color: 'rgb(var(--va-ink-rgb) / .12)' }, { label: '收入（浅色）', color: 'rgb(var(--va-ink-rgb) / .35)' }, { label: '回款（实心）', color: 'var(--va-ink-2)' }]}>
        <HBars rows={d.models.map(m => ({ key: m.id, label: m.id, sub: m.dept, values: [m.target, m.revenue, m.received], color: color(m.id) }))}
          max={Math.max(1, ...d.models.map(m => m.target))}
          series={[{ id: 't', label: '目标', color: 'var(--va-ink-1)', mix: 12 }, { id: 'r', label: '收入', color: 'var(--accent)', mix: 45 }, { id: 'c', label: '回款', color: 'var(--accent)' }]}
          valueText={r => `${pct(r.values[1] / (r.values[0] || 1))} 完成`}
          rowNote={r => `回款率 ${pct(r.values[2] / (r.values[1] || 1))}`}
          ariaLabel={`目标、收入与回款：${d.models.map(m => `${m.id} 完成 ${pct(m.completion)}`).join('，')}`} />
      </ChartCard>
    );
    extra = (
      <>
        <ChartCard className="va-bd-third" code="FIG.C · COMPLETION" title="目标完成" desc="悬停型号查看各自完成率">
          <GaugePanel models={d.models} total={d.business.completion} size={200} />
        </ChartCard>
        <ChartCard className="va-bd-twothird" code="TAB · MODELS" title="型号经营明细">
          <DataTable caption="型号经营明细" rowKey={r => r.id} rows={d.models}
            columns={[
              { key: 'id', label: '型号', render: r => <span className="va-bill-model"><i style={{ background: color(r.id) }} aria-hidden="true" />{r.id}</span> },
              { key: 'dept', label: '部门', render: r => r.dept },
              { key: 't', label: '目标（万元）', align: 'right', render: r => wan(r.target) },
              { key: 'r', label: '收入（万元）', align: 'right', render: r => wan(r.revenue) },
              { key: 'c', label: '完成率', align: 'right', render: r => <span className="va-inline-meter"><i><b style={{ transform: `scaleX(${clamp(r.completion, 0, 1)})`, background: color(r.id) }} /></i>{pct(r.completion)}</span> },
              { key: 'rc', label: '回款（万元）', align: 'right', render: r => wan(r.received) },
              { key: 'rr', label: '回款率', align: 'right', render: r => pct(r.receivedRate) },
            ]} />
        </ChartCard>
      </>
    );
  }

  const contractObj = contract ? data.contracts.find(c => c.id === contract) : null;

  return (
    <div className="va-board">
      <header className="va-board-head">
        <div className="va-wrap">
          <nav className="va-crumbs" aria-label="位置">
            <a href={link('home')}><ArrowLeft size={14} aria-hidden="true" />首页</a>
            <span aria-hidden="true">/</span>
            <a href={link('home', null, { section: 'domains' })}>{domain?.name ?? '业务域'}</a>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{asset.name}</span>
          </nav>
          <div className="va-board-title">
            <div>
              <p className="va-mono">{asset.code} · {asset.category}</p>
              <h1>{asset.name}</h1>
              <p className="va-board-desc">{asset.desc}</p>
            </div>
            <dl className="va-board-meta">
              <div><dt className="va-mono">OWNER</dt><dd>{asset.owner}</dd></div>
              <div><dt className="va-mono">SOURCE</dt><dd>{asset.source}</dd></div>
              <div><dt className="va-mono">AS OF</dt><dd className="va-num">{dateTimeLabel(d.meta.asOf)}</dd></div>
              <div><dt className="va-mono">DATA</dt><dd><span className="va-demo-badge">演示数据</span></dd></div>
            </dl>
          </div>
        </div>
      </header>

      <div className="va-filterbar" role="region" aria-label="筛选">
        <div className="va-wrap va-filter-inner">
          <div className="va-filter-models" role="group" aria-label="型号">
            <span className="va-mono">MODEL</span>
            <button type="button" className="va-chip" aria-pressed={models.length === 0} onClick={() => setModels([])}>全部</button>
            {all.options.models.map(m => (
              <button key={m} type="button" className="va-chip" aria-pressed={models.includes(m)} onClick={() => toggleModel(m)}>
                <i style={{ background: color(m) }} aria-hidden="true" />{m}
              </button>
            ))}
          </div>
          <div className="va-filter-selects">
            <Select label="PERIOD 期间" value={period} onChange={setPeriod} options={all.options.periods} />
            {kind !== 'operations' && <Select label="SUBSYS 分系统" value={system} onChange={setSystem} options={[{ value: 'all', label: '全部分系统' }, ...all.options.systems.map(s => ({ value: s, label: s }))]} />}
            {kind === 'expenses' && <Select label="DEPT 部门" value={dept} onChange={setDept} options={[{ value: 'all', label: '全部部门' }, ...all.options.depts.map(s => ({ value: s, label: s }))]} />}
          </div>
          <div className="va-filter-end">
            {contractObj && (
              <button type="button" className="va-chip is-filter" onClick={() => setContract(null)} aria-label={`取消合同筛选：${contractObj.name}`}>
                合同：{contractObj.name}<X size={13} aria-hidden="true" />
              </button>
            )}
            <span className="va-filter-count va-mono" aria-live="polite">{rows.length} BILLS</span>
            <button type="button" className="va-btn va-btn-sm" onClick={reset} disabled={!dirty}><RotateCcw size={14} aria-hidden="true" />重置</button>
          </div>
        </div>
      </div>

      <div className="va-wrap va-board-body">
        <h2 className="va-sr">关键指标</h2>
        <KpiRow items={kpis} />
        {!ready && <p className="va-empty">当前筛选条件下没有数据。</p>}
        <h2 className="va-sr">图表</h2>
        <div ref={grid} className="va-board-grid va-spotlit">
          {main}
          {side}
          {extra}
        </div>

        <section className="va-card va-bills-card" aria-labelledby="va-bills-title">
          <header className="va-card-head">
            <div>
              <p className="va-mono">TAB · BILLS</p>
              <h2 id="va-bills-title">{kind === 'operations' ? '关联报账单' : '报账单明细'}</h2>
              <p className="va-card-desc">点任意一行，展开这张报账单的付款链路：合同 → 报账 → 付款。</p>
            </div>
            <div className="va-bills-stats">
              {d.byStatus.map(s => <span key={s.status}><StatusBadge status={s.status} /><b className="va-num">{s.count}</b></span>)}
            </div>
          </header>
          <BillTable rows={rows} openId={openId} onOpen={(id, el) => { opener.current = el; setOpenId(id); }} />
        </section>
      </div>

      <ChainDrawer bill={openBill} onClose={() => { setOpenId(null); setTimeout(() => opener.current?.focus?.(), 0); }} />
    </div>
  );
}
