import { useCallback, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpRight, RotateCcw } from 'lucide-react';
import { useDerived, useSite } from '../../core/provider';
import { href } from '../../core/route';
import type { BillRow, Derived } from '../../core/data/derive';
import type { Asset } from '../../core/data/types';
import { dateTimeLabel, dayLabel, int, monthLabel, pct, wan, wanLabel } from '../../core/data/format';
import { NumberRoller } from '../../core/ui/NumberRoller';
import { useModelColor } from './lib';
import { assetFocus, type Focus } from './focus';
import { BarRows, ColumnChart, Dumbbell, LineChart, Sankey, SmallMultiples, type BarRow, type MultipleItem } from './charts';
import { ChainDrawer } from './drawer';
import { Footer, Nav } from './chrome';
import { ChartFrame, DataTable, Empty, Kicker, Legend, MaskText, StatusIcon, StatusTag } from './ui';

/* ------------------------------------------------------------------ */
/* 指标                                                               */
/* ------------------------------------------------------------------ */
interface Metric { label: string; value: number; unit: string; format?: (n: number) => string; sub: ReactNode }

function Metrics({ items }: { items: Metric[] }) {
  return (
    <section className="vc-wrap vc-metrics" aria-label="关键指标">
      {items.map(m => (
        <div key={m.label} className="vc-metric">
          <p className="vc-metric-k vc-mono">{m.label}</p>
          <p className="vc-metric-v"><NumberRoller value={m.value} format={m.format ?? (v => wan(v))} className="vc-num" /><small>{m.unit}</small></p>
          <p className="vc-metric-s">{m.sub}</p>
        </div>
      ))}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 付款状态条：按金额堆叠，每段都有图标和文字                             */
/* ------------------------------------------------------------------ */
function StatusStrip({ d }: { d: Derived }) {
  const total = d.byStatus.reduce((s, x) => s + x.amount, 0) || 1;
  const [hi, setHi] = useState<string | null>(null);
  return (
    <div className="vc-strip" role="group" aria-label={d.byStatus.map(s => `${s.status} ${s.count} 张，${wanLabel(s.amount)}`).join('；')}>
      <div className="vc-strip-bar" onPointerLeave={e => { if (e.pointerType === 'mouse') setHi(null); }}>
        {d.byStatus.filter(s => s.amount > 0).map(s => (
          <span key={s.status} className={`vc-strip-seg is-${s.status === '已付清' ? 'paid' : s.status === '部分付款' ? 'part' : 'none'} ${hi && hi !== s.status ? 'is-dim' : ''}`}
            style={{ flexGrow: s.amount / total }} tabIndex={0}
            onPointerEnter={() => setHi(s.status)} onPointerDown={() => setHi(s.status)} onFocus={() => setHi(s.status)} onBlur={() => setHi(null)}>
            <span className="vc-sr">{s.status}</span>
          </span>
        ))}
      </div>
      <ul className="vc-strip-list">
        {d.byStatus.map(s => (
          <li key={s.status} className={hi === s.status ? 'is-on' : ''}>
            <StatusTag status={s.status} />
            <b>{wan(s.amount)} <small>万元</small></b>
            <span>{s.count} 张 · {pct(s.amount / total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 明细表：可按日期 / 金额排序；点一行打开付款链路                        */
/* ------------------------------------------------------------------ */
function BillTable({ rows, onOpen }: { rows: BillRow[]; onOpen: (b: BillRow) => void }) {
  const color = useModelColor();
  const [sort, setSort] = useState<{ key: 'date' | 'amount'; dir: 1 | -1 }>({ key: 'date', dir: -1 });
  const sorted = useMemo(() => [...rows].sort((a, b) => (sort.key === 'date' ? a.date.localeCompare(b.date) : a.amount - b.amount) * sort.dir), [rows, sort]);
  const th = (key: 'date' | 'amount', label: string, num = false) => (
    <th scope="col" className={num ? 'is-num' : ''} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="vc-sort" onClick={() => setSort(s => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }))}>
        {label}{sort.key === key ? (sort.dir === 1 ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />) : null}
      </button>
    </th>
  );
  if (!rows.length) return <Empty />;
  return (
    <div className="vc-btable-wrap" role="region" aria-label="报账单明细，可横向滚动" tabIndex={0}>
      <table className="vc-btable">
        <caption className="vc-sr">报账单明细，点单号打开付款链路</caption>
        <thead>
          <tr>
            <th scope="col">报账单</th>
            {th('date', '日期')}
            <th scope="col">型号</th>
            <th scope="col">分系统 / 部件</th>
            <th scope="col">摘要</th>
            <th scope="col">合同</th>
            {th('amount', '金额（万元）', true)}
            <th scope="col" className="is-num">已付（万元）</th>
            <th scope="col">状态</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(r => (
            <tr key={r.id} onClick={() => onOpen(r)}>
              <td><button type="button" className="vc-link-btn vc-mono" onClick={e => { e.stopPropagation(); onOpen(r); }} aria-label={`${r.id}，打开付款链路`}>{r.id}</button></td>
              <td className="vc-nowrap">{dayLabel(r.date)}</td>
              <td className="vc-nowrap"><i className="vc-sw is-solid" style={{ '--c': color(r.model) } as CSSProperties} aria-hidden="true" />{r.model}</td>
              <td>{r.system}<span className="vc-td-sub">{r.component}</span></td>
              <td>{r.summary}</td>
              <td>{r.contractName ?? <span className="vc-muted">院内支出</span>}</td>
              <td className="is-num">{wan(r.amount)}</td>
              <td className="is-num">{wan(r.paid)}</td>
              <td className="vc-nowrap"><StatusTag status={r.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 看板                                                               */
/* ------------------------------------------------------------------ */
export function Board({ assetId }: { assetId: string | null }) {
  const { data } = useSite();
  const asset = data.assets.find(a => a.id === assetId);
  if (!asset) return <NotFound id={assetId ?? ''} />;
  return <BoardInner key={asset.id} asset={asset} />;
}

function BoardInner({ asset }: { asset: Asset }) {
  const { data } = useSite();
  const color = useModelColor();
  const focus: Focus = assetFocus(asset);
  const [models, setModels] = useState<string[]>([]);
  const [period, setPeriod] = useState('all');
  const [system, setSystem] = useState('');
  const filter = useMemo(() => ({ models, period, systems: system ? [system] : [] }), [models, period, system]);
  const d = useDerived(filter);
  const [bill, setBill] = useState<BillRow | null>(null);
  const close = useCallback(() => setBill(null), []);
  const replay = JSON.stringify(filter);
  const domain = data.domains.find(x => x.id === asset.domain);
  const active = models.length > 0 || period !== 'all' || !!system;
  const periodLabel = d.options.periods.find(p => p.value === period)?.label ?? '';
  const modelLabel = models.length ? models.join('、') : '全部型号';

  const toggleModel = (id: string) => setModels(ms => (ms.includes(id) ? ms.filter(x => x !== id) : [...ms, id].sort()));

  /* ---------- 结论句与指标 ---------- */
  const s = d.spend, b = d.business;
  const topSys = d.bySystem[0];
  let giant = 0, sentence: ReactNode = null, sub: ReactNode = null, metrics: Metric[] = [];
  if (focus === 'contracts') {
    giant = s.paid;
    sentence = <>已付款 <b>{wanLabel(s.paid)}</b>，占报账金额的 <b className="is-accent">{pct(s.payRate)}</b>。</>;
    sub = <>{s.contractCount} 份合同、合同金额 {wanLabel(s.contractAmount)}；还有 {wanLabel(s.unpaid)}待付。</>;
    metrics = [
      { label: '合同金额', value: s.contractAmount, unit: '万元', sub: `${s.contractCount} 份合同` },
      { label: '报账金额', value: s.billed, unit: '万元', sub: `${s.billCount} 张报账单` },
      { label: '已付', value: s.paid, unit: '万元', sub: `付款率 ${pct(s.payRate)}` },
      { label: '待付', value: s.unpaid, unit: '万元', sub: `${d.bills.filter(x => x.unpaid > 0).length} 张未付清` },
    ];
  } else if (focus === 'expenses') {
    giant = s.billed;
    sentence = <>报账 <b>{wanLabel(s.billed)}</b>{topSys && <>，{topSys.key}占 <b className="is-accent">{pct(topSys.billed / (s.billed || 1))}</b></>}。</>;
    sub = <>{s.billCount} 张报账单，涉及 {d.byDept.length} 个部门；已付 {pct(s.payRate)}。</>;
    metrics = [
      { label: '报账金额', value: s.billed, unit: '万元', sub: `${d.billsByMonth.length} 个月` },
      { label: '报账单', value: s.billCount, unit: '张', format: v => int(v), sub: `付款 ${s.paymentCount} 笔` },
      { label: '已付', value: s.paid, unit: '万元', sub: `付款率 ${pct(s.payRate)}` },
      { label: '最大分系统', value: topSys?.billed ?? 0, unit: '万元', sub: topSys?.key ?? '—' },
    ];
  } else {
    giant = b.revenue;
    sentence = <>收入 <b>{wanLabel(b.revenue)}</b>，完成年度目标的 <b className="is-accent">{pct(b.completion)}</b>。</>;
    sub = <>回款 {wanLabel(b.received)}，回款率 {pct(b.receivedRate)}；距目标还差 {wanLabel(b.gap)}。</>;
    metrics = [
      { label: '年度目标', value: b.target, unit: '万元', sub: `${d.models.length} 个型号` },
      { label: '收入', value: b.revenue, unit: '万元', sub: `完成 ${pct(b.completion)}` },
      { label: '回款', value: b.received, unit: '万元', sub: `回款率 ${pct(b.receivedRate)}` },
      { label: '目标缺口', value: b.gap, unit: '万元', sub: `占目标 ${pct(b.target ? b.gap / b.target : 0)}` },
    ];
  }

  /* ---------- 小多图 ---------- */
  const billMonths = d.billsByMonth.map(x => x.month);
  const multiples: MultipleItem[] = focus === 'operations'
    ? d.models.map(m => ({ id: m.id, title: m.id, sub: m.dept, color: color(m.id), values: m.monthly, foot: <>完成 <b>{pct(m.completion)}</b> · 回款率 <b>{pct(m.receivedRate)}</b></> }))
    : d.models.map(m => {
      const own = d.bills.filter(x => x.model === m.id);
      return {
        id: m.id, title: m.id, sub: m.dept, color: color(m.id),
        values: billMonths.map(mm => own.filter(x => x.month === mm).reduce((a, x) => a + x.amount, 0)),
        values2: billMonths.map(mm => own.filter(x => x.month === mm).reduce((a, x) => a + x.paid, 0)),
        foot: <>报账 <b>{wan(m.billed)} 万</b> · 已付 <b>{pct(m.billed ? m.paid / m.billed : 0)}</b></>,
      };
    });

  return (
    <>
      <Nav mode="board" assetId={asset.id} />
      <main id="vc-main" tabIndex={-1} className="vc-main vc-board">
        <header className="vc-wrap vc-bhead">
          <nav className="vc-crumbs" aria-label="位置">
            <a href={href('c')}>首页</a><span aria-hidden="true">/</span>
            <span>{domain?.name ?? asset.domain}</span><span aria-hidden="true">/</span>
            <span>{asset.category}</span>
          </nav>
          <div className="vc-bhead-row">
            <div>
              <Kicker>{asset.code} · 演示数据 · 截至 {dateTimeLabel(data.meta.asOf)}</Kicker>
              <h1 className="vc-bhead-title"><MaskText lines={[asset.name]} /></h1>
              <p className="vc-body">{asset.desc}</p>
            </div>
            <dl className="vc-bhead-meta">
              <div><dt>负责</dt><dd>{asset.owner}</dd></div>
              <div><dt>来源</dt><dd>{asset.source}</dd></div>
              <div><dt>更新</dt><dd className="vc-mono">{asset.updated}</dd></div>
            </dl>
          </div>
        </header>

        <section className="vc-wrap vc-verdict" aria-label="结论">
          <div className="vc-verdict-text">
            <p className="vc-mono vc-verdict-k">一句话结论 · {modelLabel} · {periodLabel}</p>
            <p className="vc-verdict-s">{sentence}</p>
            <p className="vc-body">{sub}</p>
          </div>
          <p className="vc-verdict-n" aria-hidden="true"><NumberRoller value={giant} format={v => wan(v)} className="vc-num" duration={1300} /><small>万元</small></p>
        </section>

        <div className="vc-filterbar">
          <div className="vc-wrap vc-filter" role="group" aria-label="筛选">
            <div className="vc-filter-g" role="group" aria-label="型号">
              <span className="vc-filter-k vc-mono">型号</span>
              <button type="button" aria-pressed={models.length === 0} onClick={() => setModels([])}>全部</button>
              {d.options.models.map(m => (
                <button key={m} type="button" aria-pressed={models.includes(m)} onClick={() => toggleModel(m)}>
                  <i className="vc-sw is-solid" style={{ '--c': color(m) } as CSSProperties} aria-hidden="true" />{m}
                </button>
              ))}
            </div>
            <label className="vc-filter-g">
              <span className="vc-filter-k vc-mono">期间</span>
              <select value={period} onChange={e => setPeriod(e.target.value)}>
                {d.options.periods.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </label>
            {focus !== 'operations' && (
              <label className="vc-filter-g">
                <span className="vc-filter-k vc-mono">分系统</span>
                <select value={system} onChange={e => setSystem(e.target.value)}>
                  <option value="">全部</option>
                  {d.options.systems.map(x => <option key={x} value={x}>{x}</option>)}
                </select>
              </label>
            )}
            {active && <button type="button" className="vc-filter-reset" onClick={() => { setModels([]); setPeriod('all'); setSystem(''); }}><RotateCcw size={14} aria-hidden="true" />清除筛选</button>}
            <span className="vc-filter-count vc-mono" aria-live="polite">{s.billCount} 张单据 · {wan(s.billed)} 万元</span>
          </div>
        </div>

        <Metrics items={metrics} />

        {focus === 'contracts' && <ContractsCharts d={d} replay={replay} />}
        {focus === 'expenses' && <ExpensesCharts d={d} replay={replay} />}
        {focus === 'operations' && <OperationsCharts d={d} replay={replay} />}

        <div className="vc-wrap">
          <ChartFrame id="vc-sm-title" kicker="型号小多图 · 同一刻度" title={focus === 'operations' ? '各型号月度收入' : '各型号月度报账与已付'}
            legend={focus === 'operations' ? undefined : <Legend items={[{ label: '报账', color: 'var(--vc-ink)', kind: 'light' }, { label: '已付', color: 'var(--vc-ink)', kind: 'solid' }]} />}>
            {multiples.length && (focus === 'operations' ? d.monthLabels.length : billMonths.length)
              ? <SmallMultiples items={multiples} labels={focus === 'operations' ? d.monthLabels : billMonths.map(monthLabel)} kind={focus === 'operations' ? 'area' : 'columns'} label2="已付" ariaLabel="型号小多图" />
              : <Empty />}
          </ChartFrame>
        </div>

        <section className="vc-wrap vc-detail" aria-labelledby="vc-detail-title">
          <header className="vc-frame-head">
            <div>
              <p className="vc-kicker">明细 · 点一行看付款链路</p>
              <h2 id="vc-detail-title" className="vc-frame-title">报账单明细</h2>
            </div>
            <p className="vc-detail-legend">{(['已付清', '部分付款', '未付款'] as const).map(st => <span key={st}><StatusIcon status={st} />{st}</span>)}</p>
          </header>
          <BillTable rows={d.bills} onOpen={setBill} />
        </section>
      </main>
      <Footer />
      <ChainDrawer bill={bill} onClose={close} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 三种侧重的图表组合                                                    */
/* ------------------------------------------------------------------ */
function ContractsCharts({ d, replay }: { d: Derived; replay: string }) {
  const color = useModelColor();
  const cs = d.contracts;
  const withBills = cs.filter(c => c.billed > 0);
  const lowPay = [...withBills].sort((a, b) => a.payRate - b.payRate)[0];
  const highBill = [...cs].filter(c => c !== lowPay).sort((a, b) => b.billRate - a.billRate)[0];
  const notes: ReactNode[] = [];
  const noteOf = new Map<string, number>();
  if (lowPay) { notes.push(<><b>{lowPay.name}</b>已报账 {pct(lowPay.billRate)}，只付了 <b className="is-accent">{pct(lowPay.payRate)}</b>，是付款最慢的一份。</>); noteOf.set(lowPay.id, notes.length); }
  if (highBill) { notes.push(<><b>{highBill.name}</b>报账进度最快，已报 {pct(highBill.billRate)}，已付 {pct(highBill.payRate)}。</>); noteOf.set(highBill.id, notes.length); }
  const rows: BarRow[] = cs.map(c => ({
    key: c.id, label: c.name.replace(/合同$/, ''), sub: c.unit, color: c.bills[0] ? color(c.bills[0].model) : 'var(--vc-ink)',
    total: c.amount, a: c.billed, b: c.paid, note: noteOf.get(c.id),
    value: <><b>{pct(c.payRate)}</b><span>{wan(c.paid)} / {wan(c.amount)} 万</span></>,
    tip: <><p className="vc-tip-row">合同金额<b>{wanLabel(c.amount)}</b></p><p className="vc-tip-row">已报账<b>{wanLabel(c.billed)} · {pct(c.billRate)}</b></p><p className="vc-tip-row">已付<b>{wanLabel(c.paid)} · {pct(c.payRate)}</b></p></>,
  }));
  const totalRow = d.contractFlow.nodes.length > 0;
  return (
    <>
      <div className="vc-wrap">
        <ChartFrame id="vc-main-title" kicker="主图 · 合同履约" title="每份合同报了多少、付了多少" notes={notes}
          legend={<Legend items={[{ label: '合同金额', color: 'var(--vc-ink-3)', kind: 'outline' }, { label: '已报账', color: 'var(--vc-ink)', kind: 'light' }, { label: '已付', color: 'var(--vc-ink)', kind: 'solid' }]} />}
          table={<DataTable caption="合同履约数据" rowKey={r => r.id} rows={cs} cols={[
            { key: 'n', label: '合同', render: r => r.name },
            { key: 'u', label: '对方单位', render: r => r.unit },
            { key: 'a', label: '合同金额（万元）', num: true, render: r => wan(r.amount) },
            { key: 'b', label: '已报账（万元）', num: true, render: r => wan(r.billed) },
            { key: 'p', label: '已付（万元）', num: true, render: r => wan(r.paid) },
            { key: 'r', label: '付款进度', num: true, render: r => pct(r.payRate) },
          ]} />}>
          {rows.length ? <BarRows rows={rows} replay={replay} ariaLabel={`合同履约：${cs.map(c => `${c.name}已付 ${pct(c.payRate)}`).join('，')}`} /> : <Empty />}
        </ChartFrame>
      </div>
      <div className="vc-wrap vc-duo">
        <ChartFrame id="vc-sec1-title" kicker="辅图 · 资金流向" title="合同 → 已付 / 待付"
          legend={<Legend items={[{ label: '已付', color: 'var(--vc-ink-3)', kind: 'solid' }, { label: '待付', color: 'var(--accent)', kind: 'hatch' }]} />}>
          {totalRow ? (
            <Sankey nodes={d.contractFlow.nodes} links={d.contractFlow.links} height={340} compact marginL={128} marginR={88}
              ariaLabel={`合同资金流向：已付 ${wanLabel(d.spend.paid)}，待付 ${wanLabel(d.spend.unpaid)}`}
              linkPaint={l => (l.target === 'st:unpaid' ? 'hatch' : 'var(--vc-ink-3)')}
              nodePaint={n => (n.id === 'st:unpaid' ? 'var(--accent)' : n.id === 'st:paid' ? 'var(--vc-ink-2)' : 'var(--vc-ink)')} />
          ) : <Empty />}
        </ChartFrame>
        <ChartFrame id="vc-sec2-title" kicker="辅图 · 付款状态" title="按金额看付款状态">
          {d.bills.length ? <StatusStrip d={d} /> : <Empty />}
        </ChartFrame>
      </div>
    </>
  );
}

function ExpensesCharts({ d, replay }: { d: Derived; replay: string }) {
  const months = d.billsByMonth;
  const peak = months.reduce((m, x, i) => (x.billed > (months[m]?.billed ?? -1) ? i : m), 0);
  const lowRate = months.reduce((m, x, i) => {
    const r = x.billed ? x.paid / x.billed : 1, rm = months[m]?.billed ? months[m].paid / months[m].billed : 1;
    return r < rm ? i : m;
  }, 0);
  const notes: ReactNode[] = [];
  const marks: { index: number }[] = [];
  if (months[peak]) { notes.push(<><b>{months[peak].label}</b>报账最多，{wanLabel(months[peak].billed)}，其中已付 {pct(months[peak].billed ? months[peak].paid / months[peak].billed : 0)}。</>); marks.push({ index: peak }); }
  if (months[lowRate] && lowRate !== peak) { notes.push(<><b>{months[lowRate].label}</b>已付比例最低，只有 <b className="is-accent">{pct(months[lowRate].billed ? months[lowRate].paid / months[lowRate].billed : 0)}</b>，{wanLabel(months[lowRate].billed - months[lowRate].paid)}还没付。</>); marks.push({ index: lowRate }); }
  const grpRows = (g: Derived['bySystem']): BarRow[] => g.map(x => ({
    key: x.key, label: x.key, sub: `${x.count} 张`, color: 'var(--vc-ink)', a: x.billed, b: x.paid,
    value: <><b>{wan(x.billed)}</b><span>已付 {pct(x.billed ? x.paid / x.billed : 0)}</span></>,
    tip: <><p className="vc-tip-row">报账<b>{wanLabel(x.billed)}</b></p><p className="vc-tip-row">已付<b>{wanLabel(x.paid)}</b></p><p className="vc-tip-row">单据<b>{x.count} 张</b></p></>,
  }));
  return (
    <>
      <div className="vc-wrap">
        <ChartFrame id="vc-main-title" kicker="主图 · 月度支出" title="每个月报了多少、付了多少" notes={notes}
          legend={<Legend items={[{ label: '报账', color: 'var(--vc-ink)', kind: 'light' }, { label: '已付', color: 'var(--accent)', kind: 'solid' }]} />}
          table={<DataTable caption="月度支出数据" rowKey={r => r.month} rows={months} cols={[
            { key: 'm', label: '月份', render: r => r.label },
            { key: 'b', label: '报账（万元）', num: true, render: r => wan(r.billed) },
            { key: 'p', label: '已付（万元）', num: true, render: r => wan(r.paid) },
            { key: 'r', label: '付款率', num: true, render: r => pct(r.billed ? r.paid / r.billed : 0) },
          ]} />}>
          {months.length ? (
            <ColumnChart labels={months.map(m => m.label)} notes={marks} replay={replay}
              series={[{ id: 'b', label: '报账', color: 'var(--vc-ink)', kind: 'light', values: months.map(m => m.billed) }, { id: 'p', label: '已付', color: 'var(--accent)', values: months.map(m => m.paid) }]}
              ariaLabel={`月度支出：${months.map(m => `${m.label}报账 ${wan(m.billed)} 万元`).join('，')}`} />
          ) : <Empty />}
        </ChartFrame>
      </div>
      <div className="vc-wrap vc-duo">
        <ChartFrame id="vc-sec1-title" kicker="辅图 · 分系统" title="钱花在哪个分系统"
          legend={<Legend items={[{ label: '报账', color: 'var(--vc-ink)', kind: 'light' }, { label: '已付', color: 'var(--vc-ink)', kind: 'solid' }]} />}>
          {d.bySystem.length ? <BarRows rows={grpRows(d.bySystem)} replay={replay} ariaLabel={`分系统支出：${d.bySystem.map(x => `${x.key} ${wan(x.billed)} 万元`).join('，')}`} /> : <Empty />}
        </ChartFrame>
        <ChartFrame id="vc-sec2-title" kicker="辅图 · 部门" title="哪个部门在报账"
          legend={<Legend items={[{ label: '报账', color: 'var(--vc-ink)', kind: 'light' }, { label: '已付', color: 'var(--vc-ink)', kind: 'solid' }]} />}>
          {d.byDept.length ? <BarRows rows={grpRows(d.byDept)} replay={replay} ariaLabel={`部门支出：${d.byDept.map(x => `${x.key} ${wan(x.billed)} 万元`).join('，')}`} /> : <Empty />}
        </ChartFrame>
      </div>
    </>
  );
}

function OperationsCharts({ d, replay }: { d: Derived; replay: string }) {
  const { data } = useSite();
  const color = useModelColor();
  const mr = d.monthlyRevenue;
  const peak = mr.reduce((m, x, i) => (x.total > (mr[m]?.total ?? -1) ? i : m), 0);
  const asOfMonth = data.meta.asOf.slice(0, 7);
  const lastIdx = mr.length - 1;
  const notes: ReactNode[] = [];
  const marks: { index: number }[] = [];
  if (mr[peak]) { notes.push(<><b>{mr[peak].label}</b>是收入最高的月份，{d.models.length} 个型号合计 <b>{wanLabel(mr[peak].total)}</b>。</>); marks.push({ index: peak }); }
  if (mr[lastIdx] && mr[lastIdx].month === asOfMonth && lastIdx !== peak) { notes.push(<><b>{mr[lastIdx].label}</b>只统计到 {dayLabel(data.meta.asOf.slice(0, 10))}，数字偏低是因为月份还没过完。</>); marks.push({ index: lastIdx }); }
  const rows: BarRow[] = d.models.map(m => ({
    key: m.id, label: m.id, sub: m.dept, color: color(m.id), total: m.target, a: m.revenue, b: m.received,
    value: <><b>{pct(m.completion)}</b><span>{wan(m.revenue)} / {wan(m.target)} 万</span></>,
    tip: <><p className="vc-tip-row">目标<b>{wanLabel(m.target)}</b></p><p className="vc-tip-row">收入<b>{wanLabel(m.revenue)} · {pct(m.completion)}</b></p><p className="vc-tip-row">回款<b>{wanLabel(m.received)} · {pct(m.receivedRate)}</b></p></>,
  }));
  return (
    <>
      <div className="vc-wrap">
        <ChartFrame id="vc-main-title" kicker="主图 · 月度趋势" title="三个型号每个月的收入" notes={notes}
          legend={<Legend items={d.models.map(m => ({ label: m.id, color: color(m.id), kind: 'line' as const }))} />}
          table={<DataTable caption="月度收入数据" rowKey={r => r.month} rows={mr} cols={[
            { key: 'm', label: '月份', render: r => r.label },
            ...d.models.map(m => ({ key: m.id, label: `${m.id}（万元）`, num: true, render: (r: typeof mr[number]) => wan(r.byModel[m.id] ?? 0) })),
            { key: 't', label: '合计（万元）', num: true, render: r => wan(r.total) },
          ]} />}>
          {mr.length && d.models.length ? (
            <LineChart labels={d.monthLabels} notes={marks} replay={replay}
              series={d.models.map(m => ({ id: m.id, label: m.id, color: color(m.id), values: m.monthly }))}
              ariaLabel={`月度收入：${mr.map(x => `${x.label}合计 ${wan(x.total)} 万元`).join('，')}`} />
          ) : <Empty />}
        </ChartFrame>
      </div>
      <div className="vc-wrap vc-duo">
        <ChartFrame id="vc-sec1-title" kicker="辅图 · 目标" title="目标、收入与回款"
          legend={<Legend items={[{ label: '目标', color: 'var(--vc-ink-3)', kind: 'outline' }, { label: '收入', color: 'var(--vc-ink)', kind: 'light' }, { label: '回款', color: 'var(--vc-ink)', kind: 'solid' }]} />}>
          {rows.length ? <BarRows rows={rows} replay={replay} ariaLabel={`各型号目标完成：${d.models.map(m => `${m.id} ${pct(m.completion)}`).join('，')}`} /> : <Empty />}
        </ChartFrame>
        <ChartFrame id="vc-sec2-title" kicker="辅图 · 比率" title="完成率与回款率"
          legend={<Legend items={[{ label: '完成率', color: 'var(--vc-ink)', kind: 'outline' }, { label: '回款率', color: 'var(--vc-ink)', kind: 'solid' }]} />}>
          {d.models.length ? <Dumbbell rows={d.models.map(m => ({ key: m.id, label: m.id, color: color(m.id), a: m.completion, b: m.receivedRate }))} aLabel="完成率" bLabel="回款率" ariaLabel={`完成率与回款率：${d.models.map(m => `${m.id} 完成 ${pct(m.completion)}，回款 ${pct(m.receivedRate)}`).join('；')}`} /> : <Empty />}
        </ChartFrame>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 未找到                                                              */
/* ------------------------------------------------------------------ */
function NotFound({ id }: { id: string }) {
  const { data } = useSite();
  return (
    <>
      <Nav mode="board" assetId={null} />
      <main id="vc-main" tabIndex={-1} className="vc-main vc-nf">
        <div className="vc-wrap">
          <Kicker>404 · ASSET · {id || '—'}</Kicker>
          <h1 className="vc-nf-title"><MaskText lines={['没有找到', '这个看板']} /></h1>
          <p className="vc-body">地址里的看板编号「{id}」不在当前数据里。可能是数据换过，或者链接写错了。</p>
          <a className="vc-btn" href={href('c')}>返回首页</a>
          <ol className="vc-boards is-small">
            {data.assets.map(a => (
              <li key={a.id}>
                <a href={href('c', 'board', a.id)} className="vc-board-link">
                  <span className="vc-board-code vc-mono">{a.code}</span>
                  <span className="vc-board-name">{a.name}<ArrowUpRight className="vc-board-arrow" size={32} strokeWidth={1.2} aria-hidden="true" /></span>
                  <span className="vc-board-desc">{a.desc}</span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      </main>
      <Footer />
    </>
  );
}
