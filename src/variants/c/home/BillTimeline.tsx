import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useSite } from '../../../core/provider';
import type { BillRow } from '../../../core/data/derive';
import { dayLabel, monthLabel, pct, wan, wanLabel } from '../../../core/data/format';
import { clamp, useModelColor } from '../lib';
import { Kicker, MaskText, StatusTag } from '../ui';

/**
 * 「N 张报账单」：横向时间线。
 * - 拖拽（鼠标 / 触控）带惯性，松手后按速度滑行并指数衰减，越界时橡皮筋回弹；
 * - 触控板横向滚动、键盘左右键、两侧按钮都能移动；卡片获得焦点时自动滚进视野；
 * - 点一张卡片打开付款链路抽屉；拖动过的那一下不算点击。
 * 关闭特效时没有惯性和缓动，直接到位。
 */
export function BillTimeline({ onOpen }: { onOpen: (b: BillRow) => void }) {
  const { derived, fx } = useSite();
  const color = useModelColor();
  const bills = [...derived.bills].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const view = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const prog = useRef<HTMLSpanElement>(null);
  const st = useRef({ x: 0, target: 0, v: 0, drag: false, moved: false, sx: 0, sx0: 0, lx: 0, lt: 0, raf: 0, min: 0 });
  const [edge, setEdge] = useState<'start' | 'mid' | 'end'>('start');

  const apply = useCallback(() => {
    const s = st.current;
    if (rail.current) rail.current.style.transform = `translate3d(${s.x.toFixed(2)}px,0,0)`;
    const p = s.min < 0 ? clamp(s.x / s.min) : 0;
    if (prog.current) prog.current.style.transform = `scaleX(${Math.max(0.04, p).toFixed(4)})`;
    setEdge(p < 0.01 ? 'start' : p > 0.99 ? 'end' : 'mid');
  }, []);

  const measure = useCallback(() => {
    const s = st.current;
    if (!view.current || !rail.current) return;
    s.min = Math.min(0, view.current.clientWidth - rail.current.scrollWidth);
    s.x = clamp(s.x, s.min, 0); s.target = clamp(s.target, s.min, 0);
    apply();
  }, [apply]);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (view.current) ro.observe(view.current);
    if (rail.current) ro.observe(rail.current);
    return () => { ro.disconnect(); cancelAnimationFrame(st.current.raf); };
  }, [measure, bills.length]);

  // 物理循环：拖拽后的惯性滑行 / 目标位置缓动 / 越界回弹
  const loop = useCallback(() => {
    const s = st.current;
    let last = performance.now();
    cancelAnimationFrame(s.raf);
    const step = (now: number) => {
      const dt = Math.min(48, now - last); last = now;
      const k = dt / 16.67;
      if (Math.abs(s.v) > 0.01) {
        s.x += s.v * k;
        s.v *= Math.pow(0.935, k);
        if (s.x > 0 || s.x < s.min) s.v *= Math.pow(0.6, k);
        s.target = s.x;
      } else {
        s.v = 0;
        const t = clamp(s.target, s.min, 0);
        s.target = t;
        s.x += (t - s.x) * (1 - Math.pow(0.8, k));
      }
      if (Math.abs(s.v) <= 0.01 && s.x > 0) s.target = 0;
      if (Math.abs(s.v) <= 0.01 && s.x < s.min) s.target = s.min;
      apply();
      if (Math.abs(s.v) > 0.01 || Math.abs(s.target - s.x) > 0.3) s.raf = requestAnimationFrame(step);
      else { s.x = s.target; apply(); }
    };
    s.raf = requestAnimationFrame(step);
  }, [apply]);

  const goTo = useCallback((x: number) => {
    const s = st.current;
    s.v = 0;
    s.target = clamp(x, s.min, 0);
    if (!fx.motion) { s.x = s.target; apply(); return; }
    loop();
  }, [fx.motion, apply, loop]);

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const s = st.current;
    cancelAnimationFrame(s.raf);
    s.drag = true; s.moved = false; s.v = 0;
    s.sx = e.clientX; s.sx0 = s.x; s.lx = e.clientX; s.lt = performance.now();
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const s = st.current;
    if (!s.drag) return;
    const dx = e.clientX - s.sx;
    if (!s.moved && Math.abs(dx) > 5) { s.moved = true; e.currentTarget.setPointerCapture(e.pointerId); }
    if (!s.moved) return;
    let x = s.sx0 + dx;
    if (x > 0) x = x * 0.35; else if (x < s.min) x = s.min + (x - s.min) * 0.35;
    const now = performance.now(), dt = Math.max(1, now - s.lt);
    s.v = 0.75 * ((e.clientX - s.lx) / dt) * 16.67 + 0.25 * s.v;
    s.lx = e.clientX; s.lt = now;
    s.x = x; s.target = x;
    apply();
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    const s = st.current;
    if (!s.drag) return;
    s.drag = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (performance.now() - s.lt > 90) s.v = 0;
    if (!fx.motion) { s.v = 0; s.x = s.target = clamp(s.x, s.min, 0); apply(); return; }
    loop();
  };

  // 触控板横向滚动（只接管横向为主的滚动，纵向滚动交还页面）
  useEffect(() => {
    const el = view.current;
    if (!el) return;
    const on = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      const s = st.current;
      cancelAnimationFrame(s.raf);
      s.v = 0;
      s.x = clamp(s.x - e.deltaX, s.min, 0); s.target = s.x;
      apply();
    };
    el.addEventListener('wheel', on, { passive: false });
    return () => el.removeEventListener('wheel', on);
  }, [apply]);

  const cardStep = () => (rail.current?.querySelector<HTMLElement>('.vc-tl-item')?.offsetWidth ?? 280) + 24;
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(st.current.target - cardStep()); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(st.current.target + cardStep()); }
    else if (e.key === 'Home') { e.preventDefault(); goTo(0); }
    else if (e.key === 'End') { e.preventDefault(); goTo(st.current.min); }
  };
  const ensureVisible = (el: HTMLElement) => {
    const vw = view.current?.clientWidth ?? 0;
    const left = el.offsetLeft + st.current.target;
    if (left < 16) goTo(-el.offsetLeft + 16);
    else if (left + el.offsetWidth > vw - 16) goTo(-(el.offsetLeft + el.offsetWidth - vw + 16));
  };

  const s = derived.spend;
  const firstM = bills[0]?.month, lastM = bills[bills.length - 1]?.month;
  const maxAmt = Math.max(1, ...bills.map(b => b.amount));

  return (
    <section id="vc-s-bills" className="vc-bills" aria-labelledby="vc-bills-title">
      <div className="vc-wrap vc-bills-head">
        <div>
          <Kicker>04 · 单据</Kicker>
          <h2 id="vc-bills-title" className="vc-h2 is-big"><MaskText lines={[`${s.billCount} 张报账单`]} /></h2>
        </div>
        <div className="vc-bills-side">
          <p className="vc-body">{firstM && lastM && <>从 {monthLabel(firstM)} 到 {monthLabel(lastM)}，</>}合计 <b>{wanLabel(s.billed, 0)}</b>，已付 <b>{pct(s.payRate)}</b>。按日期排在一条线上，拖动浏览，点开一张看它的付款链路。</p>
          <div className="vc-bills-ctrl">
            <button type="button" className="vc-icon-btn" onClick={() => goTo(st.current.target + cardStep() * 2)} disabled={edge === 'start'} aria-label="向前"><ArrowLeft size={18} aria-hidden="true" /></button>
            <span className="vc-bills-prog" aria-hidden="true"><span ref={prog} /></span>
            <button type="button" className="vc-icon-btn" onClick={() => goTo(st.current.target - cardStep() * 2)} disabled={edge === 'end'} aria-label="向后"><ArrowRight size={18} aria-hidden="true" /></button>
          </div>
        </div>
      </div>

      <div className="vc-tl" ref={view} role="region" aria-label="报账单时间线，可用左右方向键移动" tabIndex={0} onKeyDown={onKey}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onClickCapture={e => { if (st.current.moved) { e.preventDefault(); e.stopPropagation(); st.current.moved = false; } }}>
        <div className="vc-tl-rail" ref={rail}>
          {bills.map((b, i) => {
            const newMonth = i === 0 || bills[i - 1].month !== b.month;
            const r = 4 + 8 * Math.sqrt(b.amount / maxAmt);
            return (
              <div key={b.id} className={`vc-tl-item ${newMonth ? 'is-month' : ''}`} style={{ '--c': color(b.model) } as CSSProperties}>
                {newMonth && <span className="vc-tl-month" aria-hidden="true">{monthLabel(b.month)}</span>}
                <button type="button" className="vc-tl-card" onClick={() => onOpen(b)} onFocus={e => ensureVisible(e.currentTarget.parentElement as HTMLElement)}
                  aria-label={`${b.id}，${dayLabel(b.date)}，${b.model}，${b.summary}，${wanLabel(b.amount)}，${b.status}。打开付款链路`}>
                  <span className="vc-tl-top"><span className="vc-mono">{b.id.replace(/^BZD-\d{4}-/, 'No.')}</span><span>{dayLabel(b.date)}</span></span>
                  <span className="vc-tl-amt"><b>{wan(b.amount)}</b><small>万元</small></span>
                  <span className="vc-tl-sum">{b.summary}</span>
                  <span className="vc-tl-meta"><i className="vc-sw is-solid" style={{ '--c': color(b.model) } as CSSProperties} aria-hidden="true" />{b.model} · {b.system}</span>
                  <span className="vc-tl-foot"><StatusTag status={b.status} /><span className="vc-tl-pay">付款 {b.payments.length} 笔</span></span>
                  <span className="vc-tl-meter" aria-hidden="true"><i style={{ transform: `scaleX(${b.amount ? b.paid / b.amount : 0})` }} /></span>
                </button>
                <span className="vc-tl-stem" aria-hidden="true" />
                <span className="vc-tl-dot" aria-hidden="true" style={{ width: r * 2, height: r * 2 }} />
              </div>
            );
          })}
        </div>
      </div>
      <p className="vc-wrap vc-caption vc-mono">圆点大小对应报账金额 · 卡片底部细条是已付比例</p>
    </section>
  );
}
