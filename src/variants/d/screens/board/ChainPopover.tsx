import { useEffect, useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useSite } from '../../../../core/provider';
import type { BillRow } from '../../../../core/data/derive';
import { dayLabel, pct, wan } from '../../../../core/data/format';
import { useModelColor } from '../../viz';
import { IconBill, IconClose, IconContract, IconPayment } from '../../ui/icons';
import { IconWaiting } from './icons';
import { pieD } from './Timeline';
import { STATUS_KIND } from './lib';

/**
 * 付款链路浮层：合同 → 报账 → 付款。
 * - 挂在 body 上（position: fixed），优先放在触发点上方，放不下就放下方，左右夹在视口内，箭头指向触发点；
 * - 打开后焦点进浮层；Esc、点浮层外面、点关闭都会关上，焦点回到原来那张单子；
 * - 三段依次出现，连线描出后有一段光沿资金方向流动（关闭特效时直接显示终态）。
 */
export function ChainPopover({ bill, anchor, onClose }: { bill: BillRow; anchor: DOMRect; onClose: (restoreFocus: boolean) => void }) {
  const { derived, fx } = useSite();
  const colorOf = useModelColor();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // 位置
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight, pad = 12, gap = 12;
    const vw = window.innerWidth, vh = window.innerHeight;
    const ax = anchor.left + anchor.width / 2;
    let top = anchor.top - h - gap, below = false;
    if (top < pad + 52) { top = anchor.bottom + gap; below = true; }
    top = Math.max(pad, Math.min(top, vh - h - pad));
    const left = Math.max(pad, Math.min(ax - w / 2, vw - w - pad));
    el.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
    el.style.setProperty('--arrow-x', `${Math.round(Math.max(18, Math.min(w - 18, ax - left)))}px`);
    el.dataset.side = below ? 'below' : 'above';
  }, [anchor, bill.id]);

  // 焦点、Esc、点外面关闭
  useEffect(() => {
    const el = ref.current;
    const t = window.setTimeout(() => el?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true }), 30);
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); closeRef.current(true); } };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!el || !target || el.contains(target)) return;
      if (target.closest('[data-bill]')) return; // 点另一张单子：由时间线自己切换
      closeRef.current(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown, true); };
  }, [bill.id]);

  const contract = bill.contractId ? derived.contracts.find(c => c.id === bill.contractId) ?? null : null;
  const ratio = bill.amount ? bill.paid / bill.amount : 0;
  const kind = STATUS_KIND[bill.status];
  const color = colorOf(bill.model);
  const trap = (e: KeyboardEvent) => {
    if (e.key !== 'Tab' || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])')];
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return createPortal(
    <div ref={ref} key={bill.id} className={`vd-chain vd-pop${fx.motion ? ' is-motion' : ''}`} role="dialog" aria-modal="false" aria-labelledby="vd-chain-title" onKeyDown={trap}
      style={{ '--c': color } as CSSProperties}>
      <span className="vd-chain-arrow" aria-hidden="true" />
      <header className="vd-chain-head">
        <div className="vd-chain-titles">
          <p className="vd-kicker">PAYMENT CHAIN · {bill.id}</p>
          <h2 id="vd-chain-title">{bill.summary}</h2>
          <p className="vd-chain-meta">
            <i style={{ background: color }} aria-hidden="true" />{bill.model}<span>·</span>{bill.system}<span>·</span>{bill.dept}
          </p>
        </div>
        <span className={`vd-chain-status is-${kind}`}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5" /><path d={pieD(6, 6, 5, ratio)} /></svg>
          {bill.status}
        </span>
        <button type="button" className="vd-icon-btn vd-chain-close" onClick={() => onClose(true)} aria-label="关闭付款链路" data-autofocus><IconClose /></button>
      </header>

      <ol className="vd-chain-steps">
        <li className="vd-chain-step" style={{ '--d': 0 } as CSSProperties}>
          <p className="vd-chain-k"><IconContract />01 · 合同</p>
          {contract ? (
            <>
              <h3 title={contract.name}>{contract.name}</h3>
              <p className="vd-chain-amt"><b>{wan(contract.amount)}</b><small>万元</small></p>
              <p className="vd-chain-sub">{contract.unit}</p>
              <span className="vd-chain-meter" aria-label={`合同已报账 ${pct(contract.billRate)}，已付款 ${pct(contract.payRate)}`}>
                <i style={{ transform: `scaleX(${Math.min(1, contract.billRate)})` }} />
                <i className="is-paid" style={{ transform: `scaleX(${Math.min(1, contract.payRate)})` }} />
              </span>
              <p className="vd-chain-sub is-mono">报 {pct(contract.billRate)} · 付 {pct(contract.payRate)}</p>
            </>
          ) : (
            <>
              <h3>院内支出</h3>
              <p className="vd-chain-sub">这张单子不挂合同，由{bill.dept}直接报账。</p>
            </>
          )}
        </li>
        <li className="vd-chain-link" aria-hidden="true" style={{ '--d': 1 } as CSSProperties}><svg viewBox="0 0 40 10" preserveAspectRatio="none"><path d="M0 5H38" pathLength={1} /><path className="is-flow" d="M0 5H38" pathLength={100} /><path className="is-head" d="M34 1.5L38.5 5L34 8.5" /></svg></li>
        <li className="vd-chain-step" style={{ '--d': 2 } as CSSProperties}>
          <p className="vd-chain-k"><IconBill />02 · 报账</p>
          <h3>{bill.component}</h3>
          <p className="vd-chain-amt"><b>{wan(bill.amount)}</b><small>万元</small></p>
          <p className="vd-chain-sub is-mono">{bill.date} · {bill.voucher}</p>
          <p className="vd-chain-sub">{bill.subject} · {bill.scope}</p>
        </li>
        <li className="vd-chain-link" aria-hidden="true" style={{ '--d': 3 } as CSSProperties}><svg viewBox="0 0 40 10" preserveAspectRatio="none"><path d="M0 5H38" pathLength={1} /><path className="is-flow" d="M0 5H38" pathLength={100} /><path className="is-head" d="M34 1.5L38.5 5L34 8.5" /></svg></li>
        <li className="vd-chain-step is-pay" style={{ '--d': 4 } as CSSProperties}>
          <p className="vd-chain-k"><IconPayment />03 · 付款<span>{bill.payments.length} 笔</span></p>
          <ul className="vd-chain-pays">
            {bill.payments.map(p => (
              <li key={p.id} title={p.account}>
                <time dateTime={p.date}>{dayLabel(p.date)}</time>
                <b>{wan(p.amount)}<small>万</small></b>
              </li>
            ))}
            {bill.unpaid > 0 && (
              <li className="is-wait">
                <span><IconWaiting />待付</span>
                <b>{wan(bill.unpaid)}<small>万</small></b>
              </li>
            )}
            {!bill.payments.length && !bill.unpaid && <li className="is-wait"><span>没有付款记录</span></li>}
          </ul>
          {bill.payments[0] && <p className="vd-chain-sub">{bill.payments[0].account}</p>}
        </li>
      </ol>

      <footer className="vd-chain-foot">
        <span className="vd-chain-bar" role="img" aria-label={`已付 ${pct(ratio)}`}>
          <i style={{ transform: `scaleX(${Math.min(1, ratio)})` }} />
        </span>
        <p>已付 <b>{wan(bill.paid)}</b> 万 · {pct(ratio)}{bill.unpaid > 0 && <> · 待付 <b className="is-signal">{wan(bill.unpaid)}</b> 万</>}</p>
      </footer>
    </div>,
    document.body,
  );
}
