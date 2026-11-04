import { useRef } from 'react';
import { useDerived } from '../../../core/provider';
import { useSpotlight } from '../../../core/fx/hooks';
import type { FlowLink, FlowNode } from '../../../core/data/derive';
import { pct, wan, wanLabel } from '../../../core/data/format';
import { ChartCard, DataTable } from '../charts/kit';
import { TimeChart } from '../charts/TimeChart';
import { GaugePanel } from '../charts/Gauge';
import { FlowGraph } from '../charts/FlowGraph';
import { HBars } from '../charts/Bars';
import { cumsum, useModelColor } from '../lib';

/** 资金脉络：合同 → 报账 → 付款 */
export function fundChain(d: ReturnType<typeof useDerived>) {
  const nodes: FlowNode[] = [];
  const links: FlowLink[] = [];
  d.contracts.filter(c => c.billed > 0).forEach(c => {
    nodes.push({ id: `c:${c.id}`, label: c.name, column: 0, value: c.billed, kind: 'contract' });
    links.push({ source: `c:${c.id}`, target: 'b:all', value: c.billed });
  });
  const none = d.bills.filter(b => !b.contractId).reduce((s, b) => s + b.amount, 0);
  if (none > 0) {
    nodes.push({ id: 'c:none', label: '院内支出（无合同）', column: 0, value: none, kind: 'contract' });
    links.push({ source: 'c:none', target: 'b:all', value: none });
  }
  if (d.spend.billed > 0) nodes.push({ id: 'b:all', label: `报账 ${d.spend.billCount} 张`, column: 1, value: d.spend.billed, kind: 'system' });
  if (d.spend.paid > 0) { nodes.push({ id: 'st:paid', label: '已付款', column: 2, value: d.spend.paid, kind: 'status' }); links.push({ source: 'b:all', target: 'st:paid', value: d.spend.paid }); }
  if (d.spend.unpaid > 0) { nodes.push({ id: 'st:unpaid', label: '待付款', column: 2, value: d.spend.unpaid, kind: 'status' }); links.push({ source: 'b:all', target: 'st:unpaid', value: d.spend.unpaid }); }
  return { nodes, links };
}

export const statusNodeColor = (n: FlowNode) =>
  n.id === 'st:unpaid' ? 'var(--va-signal)' : n.id === 'st:paid' ? 'var(--accent)' : n.kind === 'system' ? 'var(--va-ink-1)' : 'var(--va-ink-3)';
export const statusLinkColor = (_s: FlowNode, t: FlowNode) =>
  t.id === 'st:unpaid' ? 'rgb(var(--va-signal-rgb))' : 'rgb(var(--accent-rgb))';

/** 可视化主区：Bento（12 栏），整组卡片共用一个聚光灯边框光源 */
export function Overview() {
  const d = useDerived();
  const color = useModelColor();
  const grid = useRef<HTMLDivElement>(null);
  useSpotlight(grid, true);

  const series = d.models.map(m => ({ id: m.id, label: m.id, color: color(m.id), values: cumsum(m.monthly) }));
  const totalCum = cumsum(d.monthlyRevenue.map(m => m.total));
  const target = d.business.target;
  const flow = fundChain(d);

  return (
    <div ref={grid} className="va-bento va-spotlit">
      <ChartCard className="va-b-rev" code="FIG.01 · REVENUE / TARGET" title="收入与目标"
        desc={`各型号累计收入，虚线为年度目标 ${wanLabel(target, 0)}`}
        legend={[...d.models.map(m => ({ label: m.id, color: color(m.id) })), { label: '年度目标', color: 'var(--va-ink-2)', kind: 'dash' as const }]}
        table={<DataTable caption="各型号按月累计收入（万元）" rowKey={r => r.label}
          columns={[{ key: 'm', label: '月份', render: r => r.label }, ...d.models.map((m, k) => ({ key: m.id, label: m.id, align: 'right' as const, render: (r: { i: number }) => wan(series[k].values[r.i]) })), { key: 't', label: '合计', align: 'right', render: r => wan(totalCum[r.i]) }, { key: 'p', label: '完成率', align: 'right', render: r => pct(totalCum[r.i] / (target || 1)) }]}
          rows={d.monthLabels.map((label, i) => ({ label, i }))} />}>
        <TimeChart labels={d.monthLabels} series={series} mode="stack" reference={{ value: target, label: `年度目标 ${wanLabel(target, 0)}` }}
          ariaLabel={`各型号累计收入堆叠面积图，截至 ${d.monthLabels[d.monthLabels.length - 1] ?? ''} 累计 ${wanLabel(totalCum[totalCum.length - 1] ?? 0)}，年度目标 ${wanLabel(target)}，完成 ${pct(d.business.completion)}`}
          totalLabel="累计合计" endLabel={v => `累计 ${wanLabel(v, 0)}`} height={300}
          extraRows={i => [{ label: '目标完成', value: pct(totalCum[i] / (target || 1)) }]} />
      </ChartCard>

      <ChartCard className="va-b-gauge" code="FIG.02 · COMPLETION" title="型号完成率" desc="收入 ÷ 年度目标，悬停型号查看">
        <GaugePanel models={d.models} total={d.business.completion} />
      </ChartCard>

      <ChartCard className="va-b-flow" code="FIG.03 · FUND CHAIN" title="资金脉络"
        desc={`合同 → 报账 → 付款，流光方向即资金方向；付款率 ${pct(d.spend.payRate)}`}
        legend={[{ label: '已付款', color: 'var(--accent)' }, { label: '待付款', color: 'var(--va-signal)' }]}>
        <FlowGraph nodes={flow.nodes} links={flow.links} height={320} columnTitles={['CONTRACT 合同', 'BILL 报账', 'PAYMENT 付款']}
          ariaLabel={`资金脉络：${d.contracts.length} 份合同与院内支出共报账 ${wanLabel(d.spend.billed)}，已付款 ${wanLabel(d.spend.paid)}，待付款 ${wanLabel(d.spend.unpaid)}`}
          nodeColor={statusNodeColor} linkColor={statusLinkColor} />
      </ChartCard>

      <ChartCard className="va-b-sys" code="FIG.04 · BY SUBSYSTEM" title="分系统支出" desc="浅色为报账金额，深色为其中已付款"
        legend={[{ label: '报账', color: 'rgb(var(--accent-rgb) / .28)' }, { label: '已付款', color: 'var(--accent)' }]}>
        <HBars rows={d.bySystem.map(g => ({ key: g.key, label: g.key, sub: `${g.count} 张`, values: [g.billed, g.paid] }))}
          series={[{ id: 'billed', label: '报账', color: 'var(--accent)', mix: 28 }, { id: 'paid', label: '已付款', color: 'var(--accent)' }]}
          valueText={r => `${wan(r.values[0])} 万元`}
          rowNote={r => `付款率 ${pct(r.values[1] / (r.values[0] || 1))}`}
          ariaLabel={`分系统支出横向柱图：${d.bySystem.map(g => `${g.key} 报账 ${wanLabel(g.billed)}`).join('，')}`} />
      </ChartCard>
    </div>
  );
}
