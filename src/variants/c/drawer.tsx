import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { X } from 'lucide-react';
import { useDerived, useSite } from '../../core/provider';
import type { BillRow } from '../../core/data/derive';
import { dayLabel, pct, wan, wanLabel } from '../../core/data/format';
import { EASE, useEnter, useModelColor } from './lib';
import { StatusTag } from './ui';

/**
 * 付款链路抽屉：合同 → 报账 → 付款。
 * 左侧一根竖线把三段串起来，打开时逐段描出；Esc、点遮罩、关闭按钮都能关；焦点在抽屉内循环。
 */
export function ChainDrawer({ bill, onClose }: { bill: BillRow | null; onClose: () => void }) {
  if (!bill) return null;
  return <DrawerBody bill={bill} onClose={onClose} />;
}

function DrawerBody({ bill, onClose }: { bill: BillRow; onClose: () => void }) {
  const { fx } = useSite();
  const all = useDerived();
  const color = useModelColor();
  const root = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const contract = useMemo(() => all.contracts.find(c => c.id === bill.contractId) ?? null, [all, bill.contractId]);
  const payments = useMemo(() => [...bill.payments].sort((a, b) => a.date.localeCompare(b.date)), [bill]);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab' || !root.current) return;
      const f = Array.from(root.current.querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])'));
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [onClose]);

  useEnter(root, el => {
    const out: Animation[] = [];
    const panel = el.querySelector('.vc-drawer-panel');
    const scrim = el.querySelector('.vc-drawer-scrim');
    if (scrim) out.push(scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 380, easing: 'ease-out', fill: 'backwards' }));
    if (panel) out.push(panel.animate([{ transform: 'translateX(104%)' }, { transform: 'none' }], { duration: 640, easing: EASE, fill: 'backwards' }));
    el.querySelectorAll('.vc-chain-line').forEach(p => out.push(p.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 1200, delay: 260, easing: EASE, fill: 'backwards' })));
    el.querySelectorAll('.vc-chain > li').forEach((li, i) => out.push(li.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 620, delay: 300 + i * 160, easing: EASE, fill: 'backwards' })));
    return out;
  }, { enabled: fx.motion, replay: bill.id });

  let running = 0;
  return (
    <div className="vc-drawer" ref={root} role="dialog" aria-modal="true" aria-labelledby="vc-drawer-title">
      <div className="vc-drawer-scrim" onClick={onClose} aria-hidden="true" />
      <aside className="vc-drawer-panel">
        <header className="vc-drawer-head">
          <div>
            <p className="vc-kicker">付款链路 · 合同 → 报账 → 付款</p>
            <h2 id="vc-drawer-title" className="vc-drawer-title">{bill.id}</h2>
          </div>
          <button ref={closeBtn} type="button" className="vc-icon-btn" onClick={onClose} aria-label="关闭付款链路"><X size={18} aria-hidden="true" /></button>
        </header>
        <p className="vc-drawer-sum">
          {bill.summary}，报账 <b>{wanLabel(bill.amount)}</b>，已付 <b>{pct(bill.amount ? bill.paid / bill.amount : 0)}</b>。
        </p>

        <div className="vc-chain-wrap">
          <span className="vc-chain-line" aria-hidden="true" />
          <ol className="vc-chain">
            <li>
              <span className="vc-chain-dot" aria-hidden="true" />
              <p className="vc-chain-step"><span className="vc-mono">01</span>合同</p>
              {contract ? (
                <>
                  <h3 className="vc-chain-name">{contract.name}</h3>
                  <dl className="vc-kv">
                    <div><dt>合同编号</dt><dd className="vc-mono">{contract.id}</dd></div>
                    <div><dt>对方单位</dt><dd>{contract.unit}</dd></div>
                    <div><dt>合同金额</dt><dd>{wanLabel(contract.amount)}</dd></div>
                    <div><dt>签订日期</dt><dd>{dayLabel(contract.signed)}</dd></div>
                  </dl>
                  <div className="vc-chain-meter" aria-label={`合同已报账 ${pct(contract.billRate)}，已付 ${pct(contract.payRate)}`}>
                    <span className="is-billed" style={{ width: `${Math.min(1, contract.billRate) * 100}%` }} />
                    <span className="is-paid" style={{ width: `${Math.min(1, contract.payRate) * 100}%` }} />
                  </div>
                  <p className="vc-chain-meter-l"><span>已报账 {pct(contract.billRate)}（{wan(contract.billed)} 万）</span><span>已付 {pct(contract.payRate)}（{wan(contract.paid)} 万）</span></p>
                </>
              ) : (
                <p className="vc-chain-none">院内支出，没有关联合同。往来单位：{bill.unit}</p>
              )}
            </li>
            <li>
              <span className="vc-chain-dot" aria-hidden="true" />
              <p className="vc-chain-step"><span className="vc-mono">02</span>报账</p>
              <h3 className="vc-chain-name">{wanLabel(bill.amount)} <StatusTag status={bill.status} /></h3>
              <dl className="vc-kv">
                <div><dt>报账日期</dt><dd>{dayLabel(bill.date)}</dd></div>
                <div><dt>型号</dt><dd><i className="vc-sw is-solid" style={{ '--c': color(bill.model) } as CSSProperties} aria-hidden="true" />{bill.model}</dd></div>
                <div><dt>分系统 / 部件</dt><dd>{bill.system} · {bill.component}</dd></div>
                <div><dt>部门</dt><dd>{bill.dept}</dd></div>
                <div><dt>范围</dt><dd>{bill.scope}</dd></div>
                <div><dt>科目 / 凭证</dt><dd>{bill.subject} · <span className="vc-mono">{bill.voucher}</span></dd></div>
              </dl>
            </li>
            <li>
              <span className="vc-chain-dot" aria-hidden="true" />
              <p className="vc-chain-step"><span className="vc-mono">03</span>付款</p>
              {payments.length ? (
                <ul className="vc-pay">
                  {payments.map(p => {
                    running += p.amount;
                    return (
                      <li key={p.id}>
                        <span className="vc-mono">{p.id}</span>
                        <span>{dayLabel(p.date)}</span>
                        <b>{wan(p.amount)} 万</b>
                        <em>累计 {pct(bill.amount ? running / bill.amount : 0)} · {p.account}</em>
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="vc-chain-none">尚未付款。</p>}
              {bill.unpaid > 0 && <p className="vc-chain-left">还有 <b>{wanLabel(bill.unpaid)}</b>待付</p>}
            </li>
          </ol>
        </div>
      </aside>
    </div>
  );
}
