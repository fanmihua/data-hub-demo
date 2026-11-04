import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useSite } from '../../../../core/provider';
import type { BillRow, Derived } from '../../../../core/data/derive';
import { dayLabel, monthShort, pct, wanLabel } from '../../../../core/data/format';
import { Tip, TipHead, TipRow, useModelColor } from '../../viz';
import { EASE, useBox, useEntrance } from '../../viz/util';
import { IconInbox } from '../../ui/icons';
import { STATUS_KIND, useBoard } from './lib';

const DAY = 86400000;
const day = (date: string) => Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / DAY;

/** 饼形圆点：已付比例画成扇形（已付清是实心，未付款只剩描边） */
export function pieD(cx: number, cy: number, r: number, ratio: number) {
  if (ratio <= 0.001) return '';
  if (ratio >= 0.999) return `M${cx - r},${cy}a${r},${r} 0 1,0 ${r * 2},0a${r},${r} 0 1,0 ${-r * 2},0Z`;
  const a = ratio * Math.PI * 2;
  const x = cx + r * Math.sin(a), y = cy - r * Math.cos(a);
  return `M${cx},${cy}L${cx},${cy - r}A${r},${r} 0 ${a > Math.PI ? 1 : 0},1 ${x.toFixed(2)},${y.toFixed(2)}Z`;
}

/** 状态小图例（已付清 / 部分付款 / 未付款），图形 + 文字 */
export function StatusLegend() {
  return (
    <ul className="vd-bd-tl-legend" aria-label="图例">
      {([['已付清', 1], ['部分付款', 0.5], ['未付款', 0]] as const).map(([t, r]) => (
        <li key={t}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="4" className={`vd-bd-tl-lg${r === 0 ? ' is-none' : ''}`} /><path d={pieD(5, 5, 4, r)} /></svg>
          {t}
        </li>
      ))}
    </ul>
  );
}

interface Mark { bill: BillRow; lane: number; x: number; y: number; r: number; pays: number[]; end: number }

/**
 * 报账时间线：横轴是日期，每个型号一行。
 * 一张报账单 = 一个饼形圆点（大小对应金额，扇形是已付比例）；从报账日到最后一笔付款画一道实线，
 * 每笔付款一个刻度；还有待付的部分用虚线延到「截至」那天。点一个圆点（或聚焦后按 Enter）展开付款链路。
 */
export function Timeline({ d }: { d: Derived }) {
  const { fx, data } = useSite();
  const { openBill, activeBill, editing } = useBoard();
  const colorOf = useModelColor();
  const root = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const { width, height } = useBox(root);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);

  const asOf = d.meta.asOf.slice(0, 10);
  const lanes = useMemo(() => {
    const ids = data.models.map(m => m.id).filter(id => d.bills.some(b => b.model === id));
    // 数据里有、但型号表里没有的型号也给一行，不丢单据
    d.bills.forEach(b => { if (!ids.includes(b.model)) ids.push(b.model); });
    return ids;
  }, [data.models, d.bills]);

  const geo = useMemo(() => {
    if (!d.bills.length || width <= 0 || height <= 0) return null;
    const dates = d.bills.flatMap(b => [b.date, ...b.payments.map(p => p.date)]);
    const first = dates.reduce((a, b) => (a < b ? a : b));
    const last = [asOf, ...dates].reduce((a, b) => (a > b ? a : b));
    const start = `${first.slice(0, 7)}-01`;
    const t0 = day(start), t1 = day(last) + 4;
    const narrow = width < 300;
    const ml = narrow ? 38 : 46, mr = 12, mt = 4, mb = 20;
    const iw = Math.max(10, width - ml - mr), ih = Math.max(10, height - mt - mb);
    const x = (date: string) => ml + ((day(date) - t0) / (t1 - t0)) * iw;
    const laneH = ih / Math.max(1, lanes.length);
    const laneY = (i: number) => mt + laneH * (i + 0.5);
    const maxAmt = Math.max(1, ...d.bills.map(b => b.amount));
    const rMax = Math.max(3.5, Math.min(7.5, laneH * 0.36));
    const rOf = (amt: number) => Math.max(2.8, rMax * (0.42 + 0.58 * Math.sqrt(amt / maxAmt)));

    const marks: Mark[] = [];
    lanes.forEach((id, li) => {
      const own = d.bills.filter(b => b.model === id).sort((a, b) => a.date.localeCompare(b.date));
      let prevX = -Infinity, flip = 1;
      for (const b of own) {
        const bx = x(b.date), r = rOf(b.amount);
        let y = laneY(li);
        // 日期挨得太近的两张单子上下错开一点
        if (bx - prevX < r * 2 + 3) { y += flip * Math.min(laneH * 0.22, 6); flip = -flip; } else flip = 1;
        prevX = bx;
        const pays = b.payments.map(p => x(p.date));
        marks.push({ bill: b, lane: li, x: bx, y, r, pays, end: Math.max(bx, ...pays) });
      }
    });

    // 月份刻度
    const months: { key: string; x: number }[] = [];
    let y0 = Number(start.slice(0, 4)), m0 = Number(start.slice(5, 7));
    for (let k = 0; k < 24; k++) {
      const key = `${y0}-${String(m0).padStart(2, '0')}`;
      const mx = x(`${key}-01`);
      if (mx > ml + iw + 1) break;
      months.push({ key, x: mx });
      m0 += 1; if (m0 > 12) { m0 = 1; y0 += 1; }
    }
    return { ml, mr, mt, mb, iw, ih, x, laneY, laneH, marks, months, asOfX: x(asOf), narrow };
  }, [d.bills, width, height, lanes, asOf]);

  useEntrance(root, el => {
    const out: Animation[] = [];
    el.querySelectorAll('.vd-bd-tl-link, .vd-bd-tl-wait').forEach((ln, i) => {
      out.push(ln.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 700, delay: 260 + i * 35, easing: EASE, fill: 'backwards' }));
    });
    el.querySelectorAll('.vd-bd-tl-mark').forEach((g, i) => {
      out.push(g.animate([{ opacity: 0, transform: 'scale(.2)' }, { opacity: 1, transform: 'none' }], { duration: 520, delay: 80 + i * 45, easing: EASE, fill: 'backwards' }));
    });
    return out;
  }, { enabled: fx.motion, ready: !!geo, key: d.bills.map(b => b.id).join('|') });

  if (!d.bills.length) {
    return (
      <div ref={root} className="vd-bd-empty">
        <span className="vd-empty-ic" aria-hidden="true"><IconInbox size={20} /></span>
        <p>这个筛选条件下没有报账单</p>
      </div>
    );
  }

  const order = geo ? [...geo.marks].sort((a, b) => a.bill.date.localeCompare(b.bill.date) || a.lane - b.lane) : [];
  const focusStep = (id: string, step: number) => {
    const i = order.findIndex(m => m.bill.id === id);
    const next = order[Math.max(0, Math.min(order.length - 1, i + step))];
    if (next) svg.current?.querySelector<SVGGElement>(`[data-bill="${next.bill.id}"]`)?.focus();
  };
  const open = (b: BillRow, el: SVGGElement) => { setHover(null); openBill(b, el.getBoundingClientRect(), el); };
  const onKey = (e: KeyboardEvent<SVGGElement>, b: BillRow) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(b, e.currentTarget); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); focusStep(b.id, 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); focusStep(b.id, -1); }
  };
  const showTip = (b: BillRow, el: SVGGElement) => {
    const r = el.querySelector('.vd-bd-tl-dot')?.getBoundingClientRect() ?? el.getBoundingClientRect();
    setHover({ id: b.id, x: r.left + r.width / 2, y: r.top });
  };
  const hb = hover ? d.bills.find(b => b.id === hover.id) ?? null : null;
  const asOfLabel = asOf.slice(5).replace('-', '/');

  return (
    <div ref={root} className="vd-bd-tl">
      {geo && (
        <svg ref={svg} width={width} height={height} role="group"
          aria-label={`报账时间线：${d.bills.length} 张报账单，按型号分 ${lanes.length} 行。用 Tab 或方向键逐张查看，按 Enter 展开付款链路。`}>
          <g className="vd-bd-tl-grid" aria-hidden="true">
            {geo.months.map(m => (
              <g key={m.key}>
                <line x1={Math.round(m.x) + 0.5} x2={Math.round(m.x) + 0.5} y1={geo.mt} y2={geo.mt + geo.ih} />
                {m.x + 34 < geo.asOfX - 62 && <text x={m.x + 4} y={height - 5}>{monthShort(m.key)}</text>}
              </g>
            ))}
            {lanes.map((id, i) => (
              <g key={id}>
                <line className="is-lane" x1={geo.ml} x2={width - geo.mr} y1={Math.round(geo.laneY(i)) + 0.5} y2={Math.round(geo.laneY(i)) + 0.5} />
                <circle cx={4} cy={geo.laneY(i)} r={3} style={{ fill: colorOf(id) }} />
                <text className="is-lane-k" x={11} y={geo.laneY(i)} dy="0.34em">{geo.narrow ? id.replace(/^[A-Z]+-/, '') : id}</text>
              </g>
            ))}
            <g className="vd-bd-tl-asof">
              <line x1={Math.round(geo.asOfX) + 0.5} x2={Math.round(geo.asOfX) + 0.5} y1={geo.mt} y2={geo.mt + geo.ih + 4} />
              <text x={geo.asOfX} y={height - 5} textAnchor="end" dx="-4">截至 {asOfLabel}</text>
            </g>
          </g>
          {geo.marks.map(mk => {
            const b = mk.bill, kind = STATUS_KIND[b.status];
            const ratio = b.amount ? b.paid / b.amount : 0;
            const on = activeBill === b.id || hover?.id === b.id;
            const dim = (hover && hover.id !== b.id) || (activeBill && activeBill !== b.id && !hover);
            return (
              <g key={b.id} data-bill={b.id}
                className={`vd-bd-tl-bill is-${kind}${on ? ' is-on' : ''}${dim ? ' is-dim' : ''}`}
                style={{ '--c': colorOf(b.model) } as CSSProperties}
                role="button" tabIndex={editing ? -1 : 0}
                aria-label={`${b.id}，${dayLabel(b.date)}，${b.model} ${b.system}，${b.summary}，${wanLabel(b.amount)}，${b.status}${b.unpaid > 0 ? `，待付 ${wanLabel(b.unpaid)}` : ''}。按 Enter 查看付款链路。`}
                onPointerEnter={e => showTip(b, e.currentTarget)} onPointerLeave={() => setHover(null)}
                onFocus={e => showTip(b, e.currentTarget)} onBlur={() => setHover(null)}
                onClick={e => open(b, e.currentTarget)} onKeyDown={e => onKey(e, b)}>
                {mk.end > mk.x + 0.5 && <line className="vd-bd-tl-link" x1={mk.x} x2={mk.end} y1={mk.y} y2={mk.y} pathLength={1} strokeDasharray="1" />}
                {b.unpaid > 0 && geo.asOfX > mk.end + mk.r && (
                  <line className="vd-bd-tl-wait" x1={mk.end + (mk.end > mk.x ? 0 : mk.r)} x2={geo.asOfX} y1={mk.y} y2={mk.y} />
                )}
                {mk.pays.map((px, i) => <line key={i} className="vd-bd-tl-pay" x1={px} x2={px} y1={mk.y - 3.5} y2={mk.y + 3.5} />)}
                <g className="vd-bd-tl-mark" style={{ transformOrigin: `${mk.x}px ${mk.y}px` }}>
                  <circle className="vd-bd-tl-hit" cx={mk.x} cy={mk.y} r={mk.r + 7} />
                  <circle className="vd-bd-tl-halo" cx={mk.x} cy={mk.y} r={mk.r + 4} />
                  <circle className="vd-bd-tl-dot" cx={mk.x} cy={mk.y} r={mk.r} />
                  {ratio > 0.001 && <path className="vd-bd-tl-pie" d={pieD(mk.x, mk.y, mk.r, ratio)} />}
                </g>
              </g>
            );
          })}
        </svg>
      )}
      {hb && hover && (
        <Tip x={hover.x} y={hover.y} placement="above">
          <TipHead>{hb.id} · {dayLabel(hb.date)}</TipHead>
          <p className="vd-bd-tip-title">{hb.summary}</p>
          <TipRow color={colorOf(hb.model)} label={`${hb.model} · ${hb.system}`} value={wanLabel(hb.amount)} />
          <TipRow label={`已付 ${hb.payments.length} 笔`} value={`${wanLabel(hb.paid)} · ${pct(hb.amount ? hb.paid / hb.amount : 0)}`} />
          <TipRow label="状态" value={hb.status} total />
          <p className="vd-bd-tip-hint">点击查看付款链路</p>
        </Tip>
      )}
    </div>
  );
}
