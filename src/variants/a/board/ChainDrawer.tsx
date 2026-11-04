import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { FileText, Receipt, Wallet, X, Hourglass } from 'lucide-react';
import { useSite } from '../../../core/provider';
import type { BillRow } from '../../../core/data/derive';
import { dayLabel, pct, wanLabel } from '../../../core/data/format';
import { StatusBadge, useModelColor, clamp } from '../lib';

/**
 * 付款链路抽屉：合同 → 报账 → 付款。
 * 右侧滑入；连线（rail）有淡色静止底线，打开后逐段描出。Esc / 遮罩关闭，焦点困在抽屉内，关闭后回到原来的行。
 */
export function ChainDrawer({ bill, onClose }: { bill: BillRow | null; onClose: () => void }) {
  const { derived, fx } = useSite();
  const color = useModelColor();
  const panel = useRef<HTMLElement>(null);
  const [played, setPlayed] = useState(false);

  useEffect(() => {
    if (!bill) return;
    setPlayed(!fx.motion);
    const id = setTimeout(() => setPlayed(true), 60);
    const t = setTimeout(() => panel.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus(), 40);
    return () => { clearTimeout(id); clearTimeout(t); };
  }, [bill?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 焦点不在抽屉里时也能用 Esc 关闭
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!bill) return;
    const on = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) closeRef.current(); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [bill]);

  if (!bill) return null;
  const contract = bill.contractId ? derived.contracts.find(c => c.id === bill.contractId) ?? null : null;
  const payRatio = bill.amount ? bill.paid / bill.amount : 0;

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key !== 'Tab' || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])')].filter(el => !el.hasAttribute('disabled'));
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const steps = 2 + bill.payments.length + (bill.unpaid > 0 ? 1 : 0);
  let n = 0;
  const delay = () => `${(n++ * 260)}ms`;

  return (
    <div className="va-drawer-layer" onKeyDown={onKey}>
      <button className="va-drawer-scrim" tabIndex={-1} aria-label="关闭付款链路" onClick={onClose} />
      <aside ref={panel} className={`va-drawer${played ? ' is-played' : ''}`} role="dialog" aria-modal="true" aria-labelledby="va-drawer-title">
        <header className="va-drawer-head">
          <div>
            <p className="va-mono">PAYMENT CHAIN · {steps} NODES</p>
            <h2 id="va-drawer-title">{bill.summary}</h2>
            <p className="va-drawer-sub"><span className="va-mono">{bill.id}</span><StatusBadge status={bill.status} /></p>
          </div>
          <button type="button" className="va-icon-btn" onClick={onClose} aria-label="关闭" data-autofocus><X size={17} /></button>
        </header>

        <div className="va-drawer-summary">
          <div><span>报账金额</span><b className="va-num">{wanLabel(bill.amount)}</b></div>
          <div><span>已付款</span><b className="va-num">{wanLabel(bill.paid)}</b></div>
          <div className={bill.unpaid > 0 ? 'is-signal' : ''}><span>待付款</span><b className="va-num">{wanLabel(bill.unpaid)}</b></div>
          <div className="va-drawer-progress" aria-label={`已付 ${pct(payRatio)}`}>
            <span style={{ transform: `scaleX(${clamp(payRatio, 0, 1)})` }} />
          </div>
        </div>

        <ol className="va-chain">
          <li className="va-chain-step" style={{ ['--d' as string]: delay() }}>
            <span className="va-chain-node"><FileText size={15} aria-hidden="true" /></span>
            <div className="va-chain-body">
              <p className="va-mono">01 · CONTRACT 合同</p>
              {contract ? (
                <>
                  <h3>{contract.name}</h3>
                  <dl className="va-kv">
                    <div><dt>合同编号</dt><dd className="va-mono-val">{contract.id}</dd></div>
                    <div><dt>往来单位</dt><dd>{contract.unit}</dd></div>
                    <div><dt>合同金额</dt><dd className="va-num">{wanLabel(contract.amount)}</dd></div>
                    <div><dt>签订日期</dt><dd className="va-num">{dayLabel(contract.signed)}</dd></div>
                  </dl>
                  <div className="va-chain-meter">
                    <span>合同履约</span>
                    <i aria-hidden="true"><b style={{ transform: `scaleX(${clamp(contract.billRate, 0, 1)})` }} /><b className="is-paid" style={{ transform: `scaleX(${clamp(contract.payRate, 0, 1)})` }} /></i>
                    <em className="va-num">报账 {pct(contract.billRate)} · 付款 {pct(contract.payRate)}</em>
                  </div>
                </>
              ) : (
                <>
                  <h3>院内支出（无合同）</h3>
                  <p className="va-chain-note">这张报账单不挂合同，直接由{bill.dept}报账。</p>
                </>
              )}
            </div>
          </li>
          <li className="va-chain-step" style={{ ['--d' as string]: delay() }}>
            <span className="va-chain-node"><Receipt size={15} aria-hidden="true" /></span>
            <div className="va-chain-body">
              <p className="va-mono">02 · BILL 报账</p>
              <h3>{bill.id}<span className="va-chain-amt va-num">{wanLabel(bill.amount)}</span></h3>
              <dl className="va-kv">
                <div><dt>报账日期</dt><dd className="va-num">{dayLabel(bill.date)}</dd></div>
                <div><dt>型号</dt><dd><i className="va-dot" style={{ background: color(bill.model) }} aria-hidden="true" />{bill.model}</dd></div>
                <div><dt>分系统</dt><dd>{bill.system} · {bill.component}</dd></div>
                <div><dt>部门</dt><dd>{bill.dept}</dd></div>
                <div><dt>科目</dt><dd>{bill.subject} · {bill.scope}</dd></div>
                <div><dt>凭证</dt><dd className="va-mono-val">{bill.voucher}</dd></div>
              </dl>
            </div>
          </li>
          {bill.payments.map((p, i) => (
            <li key={p.id} className="va-chain-step is-pay" style={{ ['--d' as string]: delay() }}>
              <span className="va-chain-node is-pay"><Wallet size={15} aria-hidden="true" /></span>
              <div className="va-chain-body">
                <p className="va-mono">{String(3 + i).padStart(2, '0')} · PAYMENT 付款 {i + 1}/{bill.payments.length}</p>
                <h3>{p.id}<span className="va-chain-amt va-num">{wanLabel(p.amount)}</span></h3>
                <dl className="va-kv">
                  <div><dt>付款日期</dt><dd className="va-num">{dayLabel(p.date)}</dd></div>
                  <div><dt>付款账户</dt><dd>{p.account}</dd></div>
                  <div><dt>占报账</dt><dd className="va-num">{pct(bill.amount ? p.amount / bill.amount : 0)}</dd></div>
                </dl>
              </div>
            </li>
          ))}
          {bill.unpaid > 0 && (
            <li className="va-chain-step is-pending" style={{ ['--d' as string]: delay() }}>
              <span className="va-chain-node is-pending"><Hourglass size={15} aria-hidden="true" /></span>
              <div className="va-chain-body">
                <p className="va-mono">{String(3 + bill.payments.length).padStart(2, '0')} · PENDING 待付</p>
                <h3>待付款<span className="va-chain-amt va-num">{wanLabel(bill.unpaid)}</span></h3>
                <p className="va-chain-note">{bill.payments.length ? `已分 ${bill.payments.length} 笔付款，还剩 ${pct(1 - payRatio)} 未付。` : '这张报账单还没有付款记录。'}</p>
              </div>
            </li>
          )}
        </ol>
        <p className="va-drawer-foot">演示数据 · 链路按报账单上的合同编号与付款记录关联</p>
      </aside>
    </div>
  );
}
