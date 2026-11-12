import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useDerived, useSite } from '../../../../core/provider';
import type { Derived } from '../../../../core/data/derive';
import { pct, pctNumber, wan, wanLabel } from '../../../../core/data/format';
import { METRICS, metricSeries, metricValue } from '../../model/metrics';
import type { ChartType, MetricKey, WidgetConfig } from '../../model/types';
import { BigNumber } from '../../ui/BigNumber';
import { Panel } from '../../ui/Panel';
import { Bars, Breakdown, Globe, Sankey, SegBar, TimeSeries, Tip, TipHead, TipRow, modelColorVar, useModelColor, type BarItem, type BreakRow, type BreakType, type Note, type Satellite, type Series } from '../../viz';
import { EASE, useBox, useEntrance } from '../../viz/util';
import { IconInbox } from '../../ui/icons';
import { IconTableView, IconLine } from './icons';
import { MiniTrend } from './MiniTrend';
import { StatusLegend, Timeline } from './Timeline';
import {
  BREAK_TYPES, BY_MODEL, COLOR_VAR, KIND_CODE, NO_MONTHLY, TYPE_LABEL, kpiContext, numFmt, partialMonth, spendMonths, streamFacts, type BoardFilter,
} from './lib';

/**
 * 看板上的单个组件：按 config.kind 和 chartType 渲染。驾驶舱和编辑状态共用。
 * - 数字都从 useDerived(filter) 现算，型号筛选、期间筛选、换数据都会跟着变；
 * - 文字一律用墨色，config.color 只用在图形（曲线、条、色标）上；
 * - 尺寸跟随格位（格位是 size 容器，样式里用 @container 做紧凑版）。
 */
export function Widget({ config, filter, onSelectModel }: { config: WidgetConfig; filter: BoardFilter; onSelectModel?: (id: string | null) => void }) {
  const d = useDerived(filter);
  switch (config.kind) {
    case 'kpi': return <KpiWidget w={config} d={d} />;
    case 'stream': return <StreamWidget w={config} d={d} />;
    case 'globe': return <GlobeWidget w={config} d={d} filter={filter} onSelectModel={onSelectModel} />;
    case 'timeseries': return <SeriesWidget w={config} d={d} />;
    case 'bars': return <BarsWidget w={config} d={d} />;
    case 'sankey': return <SankeyWidget w={config} d={d} />;
    case 'contracts': return <ContractsWidget w={config} d={d} />;
    case 'timeline': return <TimelineWidget w={config} d={d} />;
    case 'ring': return <RingWidget w={config} d={d} />;
  }
}

const colorOf = (w: WidgetConfig) => COLOR_VAR[w.color ?? 'accent'];

/* ───────── 指标卡 ───────── */

function KpiWidget({ w, d }: { w: WidgetConfig; d: Derived }) {
  const key = w.metric ?? 'completion';
  const v = metricValue(d, key);
  const { format, unit } = numFmt(key);
  const ctx = kpiContext(d, key);
  return (
    <Panel className="vd-bd-w vd-bd-kpi" spot>
      <div className="vd-bd-kpi-in" style={{ '--c': colorOf(w) } as CSSProperties}>
        <p className="vd-bd-label"><i className="vd-bd-sw" aria-hidden="true" />{w.title}</p>
        <p className="vd-bd-kpi-ctx">{ctx.text}</p>
        <div className="vd-bd-kpi-num"><BigNumber value={v} format={format} unit={unit} size="md" /></div>
        {ctx.ratio !== null && (
          <span className="vd-bd-meter" role="img" aria-label={`进度 ${pct(ctx.ratio)}`}>
            <i style={{ transform: `scaleX(${Math.max(0, Math.min(1, ctx.ratio))})` }} />
          </span>
        )}
      </div>
    </Panel>
  );
}

/* ───────── 数据流小卡 ───────── */

function StreamWidget({ w, d }: { w: WidgetConfig; d: Derived }) {
  const key = w.metric ?? 'revenue';
  const f = streamFacts(d, key);
  const { format, unit, text } = numFmt(key);
  const color = colorOf(w);
  return (
    <Panel className="vd-bd-w vd-bd-stream" spot>
      <div className="vd-bd-stream-in" style={{ '--c': color } as CSSProperties}>
        <p className="vd-bd-label">{w.title}</p>
        {f.delta && (
          <p className={`vd-bd-delta is-${f.delta.dir}`} title={`${f.delta.when}较上月末`}>
            <span className="vd-bd-delta-when">{f.delta.when}</span>
            <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">{f.delta.dir === 'flat' ? <path d="M1 4h6" /> : <path d={f.delta.dir === 'up' ? 'M4 1L7.2 6.5H.8Z' : 'M4 7L.8 1.5H7.2Z'} />}</svg>
            {f.delta.text}
          </p>
        )}
        <div className="vd-bd-stream-num"><BigNumber value={f.value} format={format} unit={unit} size="md" /></div>
        <div className="vd-bd-stream-fig">
          {f.series
            ? <MiniTrend values={f.series} months={f.months} type={w.chartType ?? 'line'} color={color} format={METRICS[key].unit === 'pct' ? (v => pct(v)) : (v => `${wan(v)} 万元`)} label={METRICS[key].label} />
            : <span className="vd-bd-na">{METRICS[key].label}没有月度明细</span>}
        </div>
        <span className="vd-sr">{w.title}：{text(f.value)}{f.delta ? `，${f.delta.when}较上月 ${f.delta.text}` : ''}</span>
      </div>
    </Panel>
  );
}

/* ───────── 地球主视觉 ───────── */

function GlobeWidget({ w, d, filter, onSelectModel }: { w: WidgetConfig; d: Derived; filter: BoardFilter; onSelectModel?: (id: string | null) => void }) {
  const { derived: all, data } = useSite();
  const ids = data.models.map(m => m.id);
  const sats: Satellite[] = useMemo(() => all.models.map(m => ({
    id: m.id,
    label: m.id,
    color: modelColorVar(ids.indexOf(m.id)),
    size: m.revenue,
    value: `收入 ${wanLabel(m.revenue)}`,
    rows: [
      { label: '目标完成率', value: pct(m.completion) },
      { label: '回款率', value: pct(m.receivedRate) },
      { label: '报账', value: wanLabel(m.billed) },
    ],
    progress: m.completion,
  })), [all.models]); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = filter.models.length === 1 ? filter.models[0] : null;
  const b = d.business;
  const selIndex = selected ? ids.indexOf(selected) : -1;
  return (
    <section className="vd-bd-w vd-bd-orbit" aria-label={w.title}>
      <span className="vd-bd-vf" aria-hidden="true"><i /><i /><i /><i /></span>
      <header className="vd-bd-orbit-head">
        <p className="vd-kicker">ORBIT · {String(sats.length).padStart(2, '0')} MODELS</p>
        <h2 className="vd-bd-orbit-title">{w.title}</h2>
      </header>
      <p className="vd-bd-orbit-hint">拖动旋转 · 点卫星筛选</p>
      <Globe mode="cockpit" satellites={sats} selected={selected} onSelect={onSelectModel} className="vd-bd-globe">
        <div className="vd-bd-hero">
          <p className="vd-bd-hero-k">
            {selected ? <><i style={{ background: modelColorVar(selIndex) }} />{selected}</> : '全部型号'}
            <span>年度目标完成率</span>
          </p>
          <BigNumber value={b.completion} format={v => pctNumber(v)} unit="%" size="xl" />
          <p className="vd-bd-hero-sub"><b>{wan(b.revenue)}</b> / {wan(b.target)} 万元</p>
        </div>
      </Globe>
      <ul className="vd-bd-orbit-legend">
        {all.models.map(m => {
          const on = selected === m.id;
          return (
            <li key={m.id}>
              <button type="button" className={on ? 'is-on' : selected ? 'is-dim' : ''} aria-pressed={on}
                onClick={() => onSelectModel?.(on ? null : m.id)}>
                <i style={{ background: modelColorVar(ids.indexOf(m.id)) }} aria-hidden="true" />
                <span>{m.id}</span>
                <b>{pct(m.completion)}</b>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ───────── 月度图表（十字线、注释） ───────── */

function SeriesWidget({ w, d }: { w: WidgetConfig; d: Derived }) {
  const key = w.metric ?? 'revenue';
  const colorOfModel = useModelColor();
  const [peek, setPeek] = useState(false);
  useEffect(() => { setPeek(false); }, [w.chartType]);
  const type: ChartType = peek ? 'table' : w.chartType ?? 'line';
  const pctUnit = METRICS[key].unit === 'pct';
  const valueFormat = pctUnit ? (v: number) => pct(v) : (v: number) => wan(v);

  const model = useMemo(() => {
    if (NO_MONTHLY.includes(key)) return null;
    let months: string[], labels: string[], series: Series[];
    if (key === 'revenue') {
      months = d.months; labels = d.monthLabels;
      series = d.models.map(m => ({ id: m.id, label: m.id, color: colorOfModel(m.id), values: m.monthly }));
    } else {
      months = key === 'completion' ? d.months : spendMonths(d);
      labels = months.map(m => `${Number(m.slice(5, 7))} 月`);
      series = [{ id: key, label: METRICS[key].label, color: colorOf(w), values: metricSeries(d, key, months) ?? [] }];
    }
    const notes: Note[] = [];
    const totals = labels.map((_, i) => series.reduce((s, x) => s + (x.values[i] ?? 0), 0));
    if (series.length > 1 && totals.length > 2) {
      let peak = 0;
      totals.forEach((v, i) => { if (v > totals[peak]) peak = i; });
      notes.push({ index: peak, text: `峰值 ${wan(totals[peak])} 万` });
    }
    const last = months.length - 1;
    const partial = last >= 0 ? partialMonth(d, months[last]) : null;
    if (partial && !notes.some(n => n.index === last) && !pctUnit) notes.push({ index: last, text: partial });
    return { labels, series, notes };
  }, [d, key, w.color]); // eslint-disable-line react-hooks/exhaustive-deps

  const actions = model && (
    <>
      {model.series.length > 1 && type !== 'table' && (
        <ul className="vd-bd-legend" aria-hidden="true">
          {model.series.map(s => <li key={s.id} style={{ '--c': s.color } as CSSProperties}><i />{s.label}</li>)}
        </ul>
      )}
      {w.chartType !== 'table' && (
        <button type="button" className={`vd-bd-mini-btn${peek ? ' is-on' : ''}`} onClick={() => setPeek(p => !p)} aria-pressed={peek}>
          {peek ? <IconLine /> : <IconTableView />}{peek ? '看图表' : '数据表'}
        </button>
      )}
    </>
  );
  return (
    <Panel className="vd-bd-w vd-bd-series" kicker={KIND_CODE.timeseries} title={w.title} actions={actions} spot>
      {model
        ? <TimeSeries labels={model.labels} series={model.series} type={type as 'line' | 'area' | 'bar' | 'table'} notes={model.notes} height="100%" unit={pctUnit ? undefined : '万元'}
            ariaLabel={`${w.title}：${model.series.map(s => `${s.label} ${model.labels.map((l, i) => `${l} ${valueFormat(s.values[i] ?? 0)}`).join('、')}`).join('；')}`}
            valueFormat={valueFormat} />
        : <Empty text={`${METRICS[key].label}只有全年数，没有月度明细。可以在配置里换成「确认收入」或「报账金额」。`} />}
    </Panel>
  );
}

/* ───────── 条形图 ───────── */

function barItems(d: Derived, key: MetricKey, color: string, colorOfModel: (id: string) => string): BarItem[] {
  const f = numFmt(key);
  if (BY_MODEL.includes(key)) {
    return d.models.map(m => {
      const value = key === 'revenue' ? m.revenue : key === 'received' ? m.received : key === 'completion' ? m.completion : m.receivedRate;
      const secondary = key === 'revenue' ? m.target : key === 'received' ? m.revenue : undefined;
      return { key: m.id, label: m.id, value, secondary, color: colorOfModel(m.id), display: f.text(value) };
    });
  }
  return d.bySystem.map(g => {
    const value = key === 'paid' ? g.paid : key === 'unpaid' ? g.billed - g.paid : key === 'payRate' ? (g.billed ? g.paid / g.billed : 0) : g.billed;
    return { key: g.key, label: g.key, value, secondary: key === 'paid' ? g.billed : undefined, color, display: f.text(value) };
  });
}

const isBreak = (t: ChartType): t is BreakType => BREAK_TYPES.includes(t);

function BarsWidget({ w, d }: { w: WidgetConfig; d: Derived }) {
  const key = w.metric ?? 'billed';
  const colorOfModel = useModelColor();
  const items = barItems(d, key, colorOf(w), colorOfModel);
  const head = BY_MODEL.includes(key) ? '型号' : '分系统';
  const box = useRef<HTMLDivElement>(null);
  const { width } = useBox(box);
  // 表头上的快捷开关：只在这次浏览里换图形看一眼，不改看板配置（配置在编辑状态的抽屉里改）
  const [peek, setPeek] = useState<ChartType | null>(null);
  useEffect(() => { setPeek(null); }, [w.chartType]);
  const type: ChartType = peek ?? w.chartType ?? 'bar';
  const rows = useMemo<BreakRow[]>(() => d.bills.map(b => ({ id: b.id, month: b.month, model: b.model, system: b.system, component: b.component, amount: b.amount, paid: b.paid })), [d.bills]);
  const aria = `${w.title}：${items.map(i => `${i.label} ${i.display}`).join('，')}`;
  const quick = width >= 560 && w.chartType !== 'table' ? (
    <div className="vd-bd-types" role="radiogroup" aria-label="图表类型">
      {(['bar', ...BREAK_TYPES] as ChartType[]).map(t => (
        <button key={t} type="button" role="radio" aria-checked={type === t} className={type === t ? 'is-on' : ''} onClick={() => setPeek(t)}>{TYPE_LABEL[t]}</button>
      ))}
    </div>
  ) : undefined;
  return (
    <div ref={box} className="vd-bd-bars-wrap">
      <Panel className={`vd-bd-w vd-bd-bars is-${type}`} kicker={isBreak(type) ? type.toUpperCase() : KIND_CODE.bars} title={w.title} actions={quick} spot>
        {type === 'table'
          ? <MiniTable head={[head, METRICS[key].label]} rows={items.map(i => [i.label, i.display])} caption={w.title} />
          : isBreak(type)
            ? <Breakdown type={type} rows={rows} colorOfModel={colorOfModel} ariaLabel={aria} />
            : <Bars items={items} ariaLabel={aria} />}
      </Panel>
    </div>
  );
}

/* ───────── 桑基 ───────── */

function SankeyWidget({ w, d }: { w: WidgetConfig; d: Derived }) {
  const empty = !d.flow.links.length;
  return (
    <Panel className="vd-bd-w vd-bd-sankey" kicker={KIND_CODE.sankey} title={w.title} spot>
      {empty
        ? <Empty text="这个筛选条件下没有资金流向" />
        : <Sankey nodes={d.flow.nodes} links={d.flow.links} height="100%"
            ariaLabel={`${w.title}：报账 ${wanLabel(d.spend.billed)}，其中已付 ${wanLabel(d.spend.paid)}，待付 ${wanLabel(d.spend.unpaid)}`} />}
    </Panel>
  );
}

/* ───────── 合同履约 ───────── */

function ContractsWidget({ w, d }: { w: WidgetConfig; d: Derived }) {
  const { fx } = useSite();
  const root = useRef<HTMLDivElement>(null);
  const [hi, setHi] = useState<{ id: string; x: number; y: number } | null>(null);
  const color = colorOf(w);
  const rows = d.contracts;
  useEntrance(root, el => {
    const out: Animation[] = [];
    el.querySelectorAll('.vd-bd-ct-track i').forEach((b, i) => out.push(b.animate([{ transform: 'scaleX(0)' }, { transform: (b as HTMLElement).style.transform || 'none' }], { duration: 820, delay: 80 + Math.floor(i / 2) * 70 + (i % 2) * 140, easing: EASE, fill: 'backwards' })));
    return out;
  }, { enabled: fx.motion && w.chartType !== 'table', key: `${w.chartType}|${rows.map(r => r.id).join('|')}` });
  const c = hi ? rows.find(r => r.id === hi.id) : null;
  if (!rows.length) return <Panel className="vd-bd-w vd-bd-contracts" kicker={KIND_CODE.contracts} title={w.title}><Empty text="这个筛选条件下没有合同" /></Panel>;
  return (
    <Panel className="vd-bd-w vd-bd-contracts" kicker={KIND_CODE.contracts} title={w.title} spot
      actions={<span className="vd-bd-ct-key" aria-hidden="true"><i className="is-billed" />已报<i className="is-paid" />已付</span>}>
      {w.chartType === 'table'
        ? <MiniTable head={['合同', '金额', '已报', '已付']} rows={rows.map(r => [r.name, wan(r.amount), pct(r.billRate), pct(r.payRate)])} caption={w.title} />
        : (
          <div ref={root} className="vd-bd-ct" style={{ '--c': color } as CSSProperties} role="list" aria-label={w.title}>
            {rows.map(r => (
              <div key={r.id} role="listitem" tabIndex={0}
                className={`vd-bd-ct-row${hi && hi.id !== r.id ? ' is-dim' : ''}${hi?.id === r.id ? ' is-on' : ''}`}
                aria-label={`${r.name}：合同 ${wanLabel(r.amount)}，已报账 ${pct(r.billRate)}，已付款 ${pct(r.payRate)}`}
                onPointerEnter={e => { const b = e.currentTarget.getBoundingClientRect(); setHi({ id: r.id, x: b.left + b.width * 0.7, y: b.top + b.height / 2 }); }}
                onPointerLeave={() => setHi(null)}
                onFocus={e => { const b = e.currentTarget.getBoundingClientRect(); setHi({ id: r.id, x: b.left + b.width * 0.7, y: b.top + b.height / 2 }); }}
                onBlur={() => setHi(null)}>
                <span className="vd-bd-ct-name" title={r.name}>{r.name}</span>
                <span className="vd-bd-ct-val"><b>{pct(r.payRate)}</b><small>已付</small></span>
                <span className="vd-bd-ct-track" aria-hidden="true">
                  <i className="is-billed" style={{ transform: `scaleX(${Math.min(1, r.billRate)})` }} />
                  <i className="is-paid" style={{ transform: `scaleX(${Math.min(1, r.payRate)})` }} />
                </span>
              </div>
            ))}
          </div>
        )}
      {c && hi && (
        <Tip x={hi.x} y={hi.y}>
          <TipHead>{c.id} · {c.unit}</TipHead>
          <p className="vd-bd-tip-title">{c.name}</p>
          <TipRow label="合同金额" value={wanLabel(c.amount)} />
          <TipRow color={`color-mix(in srgb, ${color} 35%, transparent)`} label={`已报账 ${pct(c.billRate)}`} value={wanLabel(c.billed)} />
          <TipRow color={color} label={`已付款 ${pct(c.payRate)}`} value={wanLabel(c.paid)} />
          <TipRow label="报账单" value={`${c.bills.length} 张`} total />
        </Tip>
      )}
    </Panel>
  );
}

/* ───────── 报账时间线 ───────── */

function TimelineWidget({ w, d }: { w: WidgetConfig; d: Derived }) {
  return (
    <Panel className="vd-bd-w vd-bd-timeline" kicker={`${d.bills.length} BILLS`} title={w.title} actions={<StatusLegend />} spot>
      <Timeline d={d} />
    </Panel>
  );
}

/* ───────── 环形：按型号构成 / 进度 ───────── */

function ringItems(d: Derived, key: MetricKey, colorOfModel: (id: string) => string) {
  const ratioMetric = METRICS[key].unit === 'pct';
  const byModel = new Map(d.byModel.map(g => [g.key, g]));
  const raw = d.models.map(m => {
    const g = byModel.get(m.id);
    let v: number;
    switch (key) {
      case 'revenue': v = m.revenue; break;
      case 'received': v = m.received; break;
      case 'completion': v = m.completion; break;
      case 'receivedRate': v = m.receivedRate; break;
      case 'billed': v = g?.billed ?? 0; break;
      case 'paid': v = g?.paid ?? 0; break;
      case 'unpaid': v = (g?.billed ?? 0) - (g?.paid ?? 0); break;
      case 'payRate': v = g && g.billed ? g.paid / g.billed : 0; break;
    }
    return { key: m.id, label: m.id, v, color: colorOfModel(m.id) };
  });
  const total = raw.reduce((s, x) => s + x.v, 0);
  return { ratioMetric, total, items: raw.map(x => ({ key: x.key, label: x.label, color: x.color, value: x.v, ratio: ratioMetric ? x.v : total ? x.v / total : 0 })) };
}

function RingWidget({ w, d }: { w: WidgetConfig; d: Derived }) {
  const key = w.metric ?? 'billed';
  const colorOfModel = useModelColor();
  const box = useRef<HTMLDivElement>(null);
  const { height } = useBox(box);
  const { ratioMetric, items } = ringItems(d, key, colorOfModel);
  const total = metricValue(d, key);
  const f = numFmt(key);
  const compact = height > 0 && height < 170;
  const label = `${w.title}：${items.map(i => `${i.label} ${ratioMetric ? pct(i.ratio) : `${f.text(i.value)}，占 ${pct(i.ratio)}`}`).join('，')}`;
  // 按整个格位的高度决定紧凑与否（不能按图表区量：切换后表头出现、图表区变矮，会来回跳）
  return (
    <div ref={box} className="vd-bd-ring-wrap">
      <Panel className={`vd-bd-w vd-bd-ring${compact ? ' is-compact' : ''}`} kicker={compact ? undefined : 'SHARE'} title={compact ? undefined : w.title} spot>
        <div className="vd-bd-ring-box">
          <SegBar compact={compact} title={compact ? w.title : undefined} ariaLabel={label}
            total={ratioMetric ? pct(total) : wan(total)} note={ratioMetric ? '合计' : '万元'}
            items={items.map(i => ({ key: i.key, label: i.label, color: i.color, ratio: i.ratio, display: ratioMetric ? pct(i.ratio) : f.text(i.value) }))} />
        </div>
      </Panel>
    </div>
  );
}

function MiniDonut({ items, ratioMetric, title, total, label }: { items: { key: string; label: string; color: string; ratio: number }[]; ratioMetric: boolean; title: string; total: string; label: string }) {
  const { fx } = useSite();
  const ref = useRef<SVGSVGElement>(null);
  const S = 46, sw = 6, r = (S - sw) / 2, C = 2 * Math.PI * r;
  const sum = items.reduce((s, i) => s + i.ratio, 0) || 1;
  let acc = 0;
  useEntrance(ref, el => [...el.querySelectorAll('.vd-bd-donut-arc')].map((a, i) => a.animate([{ opacity: 0, strokeDashoffset: Number((a as SVGElement).dataset.len) }, { opacity: 1, strokeDashoffset: 0 }], { duration: 900, delay: i * 120, easing: EASE, fill: 'backwards' })), { enabled: fx.motion, key: items.map(i => i.key).join('|') });
  return (
    <div className="vd-bd-donut" role="img" aria-label={label}>
      <svg ref={ref} width={S} height={S} viewBox={`0 0 ${S} ${S}`} aria-hidden="true">
        <circle cx={S / 2} cy={S / 2} r={r} className="vd-bd-donut-track" style={{ strokeWidth: sw }} />
        {items.map(i => {
          // 比例指标：各型号是独立进度，等分成扇区各自画进度；构成指标：按占比切扇区
          const share = ratioMetric ? 1 / items.length : i.ratio / sum;
          const seg = Math.max(0, share * C - 2);
          const len = ratioMetric ? seg * Math.min(1, i.ratio) : seg;
          const off = -acc * C;
          acc += share;
          return <circle key={i.key} className="vd-bd-donut-arc" cx={S / 2} cy={S / 2} r={r} data-len={len}
            style={{ stroke: i.color, strokeWidth: sw, strokeDasharray: `${len} ${C}`, strokeDashoffset: 0, transform: `rotate(${-90 + (-off / C) * 360}deg)`, transformOrigin: '50% 50%' }} />;
        })}
      </svg>
      <div className="vd-bd-donut-txt">
        <p className="vd-bd-label">{title}<span>{total}</span></p>
        <ul>
          {items.map(i => <li key={i.key}><i style={{ background: i.color }} />{i.label}<b>{pct(i.ratio)}</b></li>)}
        </ul>
      </div>
    </div>
  );
}

/* ───────── 小工具 ───────── */

function MiniTable({ head, rows, caption }: { head: string[]; rows: string[][]; caption: string }) {
  return (
    <div className="vd-bd-table" tabIndex={0} role="region" aria-label={caption}>
      <table>
        <thead><tr>{head.map((h, i) => <th key={h} scope="col" className={i ? 'is-num' : ''}>{h}</th>)}</tr></thead>
        <tbody>{rows.map(r => <tr key={r[0]}>{r.map((c, i) => i ? <td key={i} className="is-num">{c}</td> : <th key={i} scope="row">{c}</th>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function Empty({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className="vd-bd-empty">
      <span className="vd-empty-ic" aria-hidden="true"><IconInbox size={20} /></span>
      <p>{text}</p>
      {children}
    </div>
  );
}

