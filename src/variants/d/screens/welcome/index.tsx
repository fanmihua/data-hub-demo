import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { Route } from '../../../../core/route';
import { navigate } from '../../../../core/route';
import { useDerived, useSite } from '../../../../core/provider';
import { dateTimeLabel, int, pct, pctNumber, wan } from '../../../../core/data/format';
import { suggestedQuestions } from '../../model/answers';
import { buildCatalog } from '../../model/catalog';
import { METRICS, metricSeries } from '../../model/metrics';
import type { BoardId, CatalogItem } from '../../model/types';
import { AskBox } from '../../ui/AskBox';
import { BigNumber } from '../../ui/BigNumber';
import { Sparkline } from '../../ui/Sparkline';
import { IconArrowRight, IconArrowUpRight, IconClock, IconInbox, IconMetric, IconSparkle, IconStar, IconTable } from '../../ui/icons';
import { dHref, useModelColor } from '../../ui/lib';
import { Globe, type Satellite } from '../../viz';
import './welcome.css';

/**
 * 欢迎页 #/d（规范第 4.3 节）。一屏：
 *   ┌ 问候 + 大号问答框 + 一排建议问题 ┐┌ 右窄栏：最近看板 / 收藏、今日要点 ┐
 *   │            （地平线上的轨道弧）          │└──────────────────────────────────┘
 *   └ 地平线上的一排 5 个大指标（玻璃条，横跨整屏）───────────────────────────────┘
 *   背景：点阵大地球只露上半，像一道地平线，中心对准左侧主列。
 * 提交问题或点建议问题 → #/d/chat?q=…；「用问答生成看板」额外带 build=1，回答播完后自动拼草稿。
 */

/** 北京时间分时段问候 */
function greeting() {
  const parts = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: 'numeric', hourCycle: 'h23' }).formatToParts(new Date());
  const h = Number(parts.find(p => p.type === 'hour')?.value ?? 12);
  if (h >= 5 && h < 11) return '早上好';
  if (h >= 11 && h < 13) return '中午好';
  if (h >= 13 && h < 18) return '下午好';
  if (h >= 18 && h < 23) return '晚上好';
  return '夜深了';
}

const ask = (q: string, extra?: Record<string, string>) => navigate(dHref('chat', null, { q, ...extra }));

/** 收藏（演示：预设的几项资产，数值从资产目录取） */
const FAVORITES = ['metric:completion', 'table:bills', 'metric:payRate'];
const METRIC_BOARD = (id: string): BoardId | undefined => {
  if (id.startsWith('metric:')) return METRICS[id.slice(7) as keyof typeof METRICS]?.board;
  if (id === 'table:bills') return 'expenses';
  if (id === 'table:contracts' || id === 'table:payments') return 'contracts';
  if (id === 'table:models') return 'operations';
  return undefined;
};

export default function WelcomeScreen({ route: _route }: { route: Route }) {
  const { data } = useSite();
  const d = useDerived();
  const colorOf = useModelColor();
  const questions = useMemo(() => suggestedQuestions(d), [d]);
  const catalog = useMemo(() => buildCatalog(data, d), [data, d]);

  const satellites: Satellite[] = useMemo(() => d.models.map(m => ({
    id: m.id,
    label: m.id,
    color: colorOf(m.id),
    size: m.revenue,
    value: `收入 ${wan(m.revenue)} 万元`,
    rows: [{ label: '目标完成率', value: pct(m.completion) }, { label: '回款率', value: pct(m.receivedRate) }],
    progress: m.completion,
  })), [d, colorOf]);

  const low = d.models.length > 1 ? [...d.models].sort((a, b) => a.completion - b.completion)[0] : null;
  const buildQ = low ? `${low.id} 为什么完成率最低` : questions[0] ?? '年度目标完成了多少';
  const boards = catalog.filter(i => i.kind === 'board' && i.status === 'ready');

  return (
    <div className="vd-screen vd-wl">
      <div className="vd-wl-globe">
        <Globe mode="horizon" satellites={satellites} className="vd-wl-globe-viz" />
      </div>

      <section className="vd-wl-main" aria-labelledby="vd-wl-title">
        <div className="vd-wl-hero">
          <h1 id="vd-wl-title" className="vd-wl-title">{greeting()}，今天想看哪块数据？</h1>
          <p className="vd-wl-sub">数字来自演示数据，问答按关键词匹配，不是 AI 生成</p>
          <div className="vd-wl-ask">
            <AskBox
              size="hero"
              suggestions={questions}
              onSubmit={q => ask(q)}
              extra={(
                <button type="button" className="vd-wl-gen" onClick={() => ask(buildQ, { build: '1' })}>
                  <IconSparkle />用问答生成看板<IconArrowRight className="vd-wl-gen-go" />
                </button>
              )}
            />
          </div>
        </div>
        <OrbitLegend />
      </section>

      <aside className="vd-wl-aside" aria-label="最近与要点">
        <ShelfPanel boards={boards} favorites={FAVORITES.map(id => catalog.find(i => i.id === id)).filter((x): x is CatalogItem => !!x && x.status === 'ready')} />
        <Highlights />
      </aside>

      <Metrics />
    </div>
  );
}

/* ───────── 地平线上的大指标 ───────── */

function Metrics() {
  const d = useDerived();
  const revenue = metricSeries(d, 'revenue') ?? [];
  const billed = metricSeries(d, 'billed') ?? [];
  const items: { key: string; label: string; value: number; format: (n: number) => string; unit: string; viz: ReactNode; note: string }[] = [
    {
      key: 'completion', label: '年度目标完成率', value: d.business.completion, format: v => pctNumber(v), unit: '%',
      viz: <Meter ratio={d.business.completion} />, note: `目标 ${wan(d.business.target)} 万元`,
    },
    {
      key: 'revenue', label: '确认收入', value: d.business.revenue, format: v => wan(v), unit: '万元',
      viz: <Sparkline values={revenue} color="var(--accent)" width={64} height={18} />, note: `还差 ${wan(d.business.gap)} 万元`,
    },
    {
      key: 'received', label: '已回款', value: d.business.received, format: v => wan(v), unit: '万元',
      viz: <Meter ratio={d.business.receivedRate} />, note: `回款率 ${pct(d.business.receivedRate)}`,
    },
    {
      key: 'billed', label: '报账', value: d.spend.billed, format: v => wan(v), unit: '万元',
      viz: <Sparkline values={billed} color="var(--accent)" width={64} height={18} />, note: `${int(d.spend.billCount)} 张报账单`,
    },
    {
      key: 'paid', label: '已付款', value: d.spend.paid, format: v => wan(v), unit: '万元',
      viz: <Meter ratio={d.spend.payRate} />, note: `付款率 ${pct(d.spend.payRate)}`,
    },
  ];
  return (
    <section className="vd-wl-metrics" aria-label="关键指标">
      {items.map((m, i) => (
        <div key={m.key} className="vd-wl-metric" style={{ '--i': i } as CSSProperties}>
          <BigNumber label={m.label} value={m.value} format={m.format} unit={m.unit} size="lg" />
          <p className="vd-wl-metric-foot">
            <span className="vd-wl-metric-viz" aria-hidden="true">{m.viz}</span>
            <span className="vd-wl-metric-note">{m.note}</span>
          </p>
        </div>
      ))}
    </section>
  );
}

function Meter({ ratio }: { ratio: number }) {
  const r = Math.max(0, Math.min(1, ratio));
  return (
    <span className="vd-wl-meter">
      <i style={{ transform: `scaleX(${r})` }} />
    </span>
  );
}

/* ───────── 轨道图例（左下，贴着地平线） ───────── */

function OrbitLegend() {
  const d = useDerived();
  const colorOf = useModelColor();
  if (!d.models.length) return null;
  return (
    <div className="vd-wl-legend">
      <ul aria-label="型号轨道：卫星大小按收入">
        {d.models.map(m => (
          <li key={m.id}>
            <i style={{ background: colorOf(m.id) }} aria-hidden="true" />
            <b>{m.id}</b>
            <span>完成 {pct(m.completion)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ───────── 右窄栏：最近看板 / 收藏 ───────── */

function ShelfPanel({ boards, favorites }: { boards: CatalogItem[]; favorites: CatalogItem[] }) {
  const [tab, setTab] = useState<'recent' | 'fav'>('recent');
  const order: BoardId[] = ['operations', 'contracts', 'expenses'];
  const sorted = [...boards].sort((a, b) => order.indexOf(a.boardId!) - order.indexOf(b.boardId!));
  return (
    <section className="vd-wl-card vd-wl-shelf">
      <header className="vd-wl-card-head">
        <div className="vd-seg is-sm vd-wl-tabs" role="tablist" aria-label="最近与收藏">
          <button type="button" role="tab" id="vd-wl-tab-recent" aria-controls="vd-wl-pane" aria-selected={tab === 'recent'} className={tab === 'recent' ? 'is-on' : ''} onClick={() => setTab('recent')}>
            <IconClock />最近看板
          </button>
          <button type="button" role="tab" id="vd-wl-tab-fav" aria-controls="vd-wl-pane" aria-selected={tab === 'fav'} className={tab === 'fav' ? 'is-on' : ''} onClick={() => setTab('fav')}>
            <IconStar />收藏
          </button>
        </div>
        <a className="vd-wl-card-more" href={dHref('assets')}>全部<IconArrowUpRight /></a>
      </header>
      <ul id="vd-wl-pane" className="vd-wl-list" role="tabpanel" aria-labelledby={tab === 'recent' ? 'vd-wl-tab-recent' : 'vd-wl-tab-fav'} key={tab}>
        {tab === 'recent'
          ? sorted.map((b, i) => (
            <li key={b.id} style={{ '--i': i } as CSSProperties}>
              <a className="vd-wl-row" href={dHref('board', b.boardId)}>
                <span className="vd-wl-row-spark" aria-hidden="true"><Sparkline values={b.trend} color="var(--accent)" width={44} height={22} /></span>
                <span className="vd-wl-row-main">
                  <b>{b.name}</b>
                  <small>{b.owner} · {b.updated.slice(5)}</small>
                </span>
                <IconArrowRight className="vd-wl-row-go" />
              </a>
            </li>
          ))
          : favorites.map((f, i) => {
            const board = METRIC_BOARD(f.id);
            return (
              <li key={f.id} style={{ '--i': i } as CSSProperties}>
                <a className="vd-wl-row" href={board ? dHref('board', board) : dHref('assets')}>
                  <span className="vd-wl-row-ic" aria-hidden="true">{f.kind === 'table' ? <IconTable /> : <IconMetric />}</span>
                  <span className="vd-wl-row-main">
                    <b>{f.name}</b>
                    <small>{f.kind === 'table' ? '数据表' : '指标'} · {f.domainName}</small>
                  </span>
                  <span className="vd-wl-row-val">{f.valueLabel ?? (f.records !== null ? `${int(f.records)} 条` : '')}</span>
                </a>
              </li>
            );
          })}
      </ul>
    </section>
  );
}

/* ───────── 今日要点（按规则从数据生成） ───────── */

interface Tip { key: string; title: ReactNode; text: string; label: string; ratio: number; color: string; q: string }

function Highlights() {
  const d = useDerived();
  const colorOf = useModelColor();
  const tips: Tip[] = [];
  const low = d.models.length > 1 ? [...d.models].sort((a, b) => a.completion - b.completion)[0] : null;
  if (low) {
    const diff = (d.business.completion - low.completion) * 100;
    tips.push({
      key: 'low', q: `${low.id} 为什么完成率最低`, ratio: low.completion, color: colorOf(low.id),
      label: `整体 ${pct(d.business.completion)}`,
      text: `${low.id} 完成率 ${pct(low.completion)}，比整体低 ${diff.toFixed(1)} 个百分点`,
      title: <><b>{low.id}</b> 完成率 <em>{pct(low.completion)}</em>，比整体低 {diff.toFixed(1)} 个百分点</>,
    });
  }
  const top = d.bySystem[0];
  if (top && d.spend.billed) {
    tips.push({
      key: 'sys', q: '哪个分系统支出最多', ratio: top.billed / d.spend.billed, color: 'var(--accent)',
      label: `${wan(top.billed)} / ${wan(d.spend.billed)} 万元`,
      text: `${top.key}支出最多，占报账 ${pct(top.billed / d.spend.billed)}`,
      title: <><b>{top.key}</b>支出最多，占报账 <em>{pct(top.billed / d.spend.billed)}</em></>,
    });
  }
  const open = d.bills.filter(b => b.unpaid > 0).length;
  if (d.spend.billed) {
    tips.push({
      key: 'unpaid', q: '还有多少待付款', ratio: d.spend.unpaid / d.spend.billed, color: 'var(--vd-signal)',
      label: `${open} 张单据未付清`,
      text: `待付款 ${wan(d.spend.unpaid)} 万元，占报账 ${pct(d.spend.unpaid / d.spend.billed)}`,
      title: <>待付款 <em>{wan(d.spend.unpaid)} 万元</em>，占报账 {pct(d.spend.unpaid / d.spend.billed)}</>,
    });
  }
  const best = [...d.models].sort((a, b) => b.receivedRate - a.receivedRate)[0];
  if (best && d.models.length > 1) {
    tips.push({
      key: 'recv', q: `${best.id} 回款怎么样`, ratio: best.receivedRate, color: colorOf(best.id),
      label: `整体 ${pct(d.business.receivedRate)}`,
      text: `${best.id} 回款率最高，为 ${pct(best.receivedRate)}`,
      title: <><b>{best.id}</b> 回款率最高，为 <em>{pct(best.receivedRate)}</em></>,
    });
  }
  return (
    <section className="vd-wl-card vd-wl-tips" aria-labelledby="vd-wl-tips-h">
      <header className="vd-wl-card-head">
        <h2 id="vd-wl-tips-h" className="vd-wl-card-title">今日要点<span className="vd-kicker">INSIGHTS</span></h2>
        <span className="vd-wl-card-note">按规则从数据生成</span>
      </header>
      {tips.length ? (
        <ol className="vd-wl-tip-list">
          {tips.map((t, i) => (
            <li key={t.key} style={{ '--i': i } as CSSProperties}>
              <button type="button" className="vd-wl-tip" onClick={() => ask(t.q)} aria-label={`${t.text}。点击提问：${t.q}`}>
                <span className="vd-wl-tip-n" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                <span className="vd-wl-tip-body">
                  <span className="vd-wl-tip-title">{t.title}</span>
                  <span className="vd-wl-tip-bar" aria-hidden="true"><i style={{ transform: `scaleX(${Math.max(0, Math.min(1, t.ratio))})`, background: t.color }} /></span>
                  <span className="vd-wl-tip-meta"><span>{t.label}</span><span className="vd-wl-tip-ask">问问看<IconArrowRight /></span></span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <div className="vd-empty vd-wl-empty">
          <span className="vd-empty-ic" aria-hidden="true"><IconInbox size={20} /></span>
          <p className="vd-empty-h">今天没有要点</p>
          <p className="vd-empty-t">数据里还没有可以总结的内容。换一份数据，或者直接在上面问一句。</p>
        </div>
      )}
      <p className="vd-wl-tips-foot" aria-hidden="true"><span>按固定规则从演示数据生成</span><span>截至 {dateTimeLabel(d.meta.asOf).slice(5)}</span></p>
    </section>
  );
}
