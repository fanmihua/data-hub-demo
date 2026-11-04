import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useSite } from '../../../core/provider';
import { href } from '../../../core/route';
import { pct, wanLabel } from '../../../core/data/format';
import { useFinePointer } from '../lib';
import { MiniBars, MiniLine } from '../charts';
import { assetFocus } from '../focus';
import { Kicker, MaskText } from '../ui';

/**
 * 跟随鼠标的预览卡：位置用 rAF 做指数追随（有一点拖尾），出现 / 消失只动 transform 和 opacity。
 * 只在精确指针设备上启用；触控设备上行内本身已经写明关键数字。
 */
function useFollow() {
  const { fx } = useSite();
  const fine = useFinePointer();
  const box = useRef<HTMLDivElement>(null);
  const s = useRef({ x: 0, y: 0, tx: 0, ty: 0, raf: 0, shown: false });
  const [active, setActive] = useState<number | null>(null);

  const paint = useCallback(() => {
    const st = s.current;
    st.raf = 0;
    const k = fx.motion ? 0.2 : 1;
    st.x += (st.tx - st.x) * k;
    st.y += (st.ty - st.y) * k;
    const w = box.current?.offsetWidth ?? 280, h = box.current?.offsetHeight ?? 200;
    const ox = st.tx + w + 40 > window.innerWidth ? -w - 28 : 28;
    const oy = Math.min(Math.max(-h / 2, 12 - st.y), window.innerHeight - st.y - h - 96);
    if (box.current) box.current.style.transform = `translate3d(${(st.x + ox).toFixed(1)}px, ${(st.y + oy).toFixed(1)}px, 0)`;
    if (Math.abs(st.tx - st.x) > 0.3 || Math.abs(st.ty - st.y) > 0.3) st.raf = requestAnimationFrame(paint);
  }, [fx.motion]);

  useEffect(() => () => cancelAnimationFrame(s.current.raf), []);
  // 滚动后指针可能已经不在列表上（滚轮滚动不会触发 pointerleave），这时收起预览
  useEffect(() => {
    if (active === null) return;
    const on = () => { if (!document.querySelector('.vc-dom:hover, .vc-boards:hover')) { setActive(null); s.current.shown = false; } };
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [active]);

  const onMove = (e: PointerEvent) => {
    if (!fine || e.pointerType !== 'mouse') return;
    const st = s.current;
    st.tx = e.clientX; st.ty = e.clientY;
    if (!st.shown) { st.x = st.tx; st.y = st.ty; st.shown = true; }
    if (!st.raf) st.raf = requestAnimationFrame(paint);
  };
  const show = (i: number) => { if (fine) setActive(i); };
  const hide = () => { setActive(null); s.current.shown = false; };
  return { box, active, onMove, show, hide, fine };
}

function FollowCard({ follow, children }: { follow: ReturnType<typeof useFollow>; children: ReactNode }) {
  if (!follow.fine) return null;
  return (
    <div className="vc-follow" ref={follow.box} aria-hidden="true">
      <div className={`vc-follow-card ${follow.active !== null ? 'is-on' : ''}`}>{children}</div>
    </div>
  );
}

export function Domains() {
  const { derived, data } = useSite();
  const follow = useFollow();
  const s = derived.spend, b = derived.business;
  const domains = derived.domains;

  const preview = (i: number | null) => {
    if (i === null) return null;
    const d = domains[i];
    if (!d) return null;
    if (d.status !== 'ready') return (
      <>
        <p className="vc-follow-k vc-mono">{d.english} · 筹备中</p>
        <p className="vc-follow-big is-muted">筹备中</p>
        <p className="vc-follow-t">计划收录：{d.categories.join('、')}。数据接入后在这里显示。</p>
      </>
    );
    if (d.id === 'business') return (
      <>
        <p className="vc-follow-k vc-mono">{d.english} · 月度收入</p>
        <p className="vc-follow-big">{wanLabel(b.revenue, 0)}</p>
        <MiniLine values={derived.monthlyRevenue.map(m => m.total)} />
        <p className="vc-follow-t">完成年度目标 {pct(b.completion)}</p>
      </>
    );
    return (
      <>
        <p className="vc-follow-k vc-mono">{d.english} · 分系统支出</p>
        <p className="vc-follow-big">{wanLabel(s.billed, 0)}</p>
        <MiniBars rows={derived.bySystem.map(g => ({ label: g.key.replace('分系统', ''), value: g.billed }))} />
        <p className="vc-follow-t">已付 {pct(s.payRate)}</p>
      </>
    );
  };

  return (
    <section id="vc-s-domains" className="vc-wrap vc-list-sec" aria-labelledby="vc-dom-title" onPointerMove={follow.onMove}>
      <header className="vc-list-head">
        <Kicker>06 · 业务域</Kicker>
        <h2 id="vc-dom-title" className="vc-h2"><MaskText lines={[`${domains.length} 个业务域`]} /></h2>
        <p className="vc-body">{domains.filter(d => d.status === 'ready').length} 个已经有看板，其余 {domains.filter(d => d.status !== 'ready').length} 个如实标注筹备中。</p>
      </header>
      <ol className="vc-dom" onPointerLeave={follow.hide}>
        {domains.map((d, i) => {
          const ready = d.status === 'ready';
          const first = data.assets.find(a => a.domain === d.id);
          const inner = (
            <>
              <span className="vc-dom-no vc-mono">{String(i + 1).padStart(2, '0')}</span>
              <span className="vc-dom-name">{d.name}</span>
              <span className="vc-dom-mid"><span className="vc-mono">{d.english}</span><span>{d.desc}</span></span>
              <span className="vc-dom-st">{ready ? `${d.assetCount} 张看板` : '筹备中'}</span>
              {ready && <ArrowUpRight className="vc-dom-arrow" size={28} strokeWidth={1.4} aria-hidden="true" />}
            </>
          );
          return (
            <li key={d.id} className={`vc-dom-row ${ready ? '' : 'is-planned'} ${follow.active === i ? 'is-on' : ''}`} onPointerEnter={() => follow.show(i)}>
              {ready && first ? <a href={href('c', 'board', first.id)} className="vc-dom-link">{inner}</a> : <div className="vc-dom-link" aria-disabled="true">{inner}</div>}
            </li>
          );
        })}
      </ol>
      <FollowCard follow={follow}>{preview(follow.active)}</FollowCard>
    </section>
  );
}

export function Boards() {
  const { derived, data } = useSite();
  const follow = useFollow();
  const s = derived.spend, b = derived.business;
  const assets = data.assets;

  const headline = (i: number) => {
    const a = assets[i];
    const f = assetFocus(a);
    if (f === 'operations') return { k: '收入', v: wanLabel(b.revenue, 0), t: `完成年度目标 ${pct(b.completion)}` };
    if (f === 'expenses') return { k: '报账', v: wanLabel(s.billed, 0), t: `${derived.bySystem[0]?.key ?? ''}最多` };
    return { k: '已付', v: wanLabel(s.paid, 0), t: `占报账的 ${pct(s.payRate)}` };
  };
  const preview = (i: number | null) => {
    if (i === null || !assets[i]) return null;
    const f = assetFocus(assets[i]);
    const h = headline(i);
    return (
      <>
        <p className="vc-follow-k vc-mono">{assets[i].code} · {h.k}</p>
        <p className="vc-follow-big">{h.v}</p>
        {f === 'operations' && <MiniLine values={derived.monthlyRevenue.map(m => m.total)} />}
        {f === 'expenses' && <MiniBars rows={derived.byDept.map(g => ({ label: g.key, value: g.billed }))} />}
        {f === 'contracts' && <MiniBars rows={derived.contracts.map(c => ({ label: c.name.replace(/合同$/, '').slice(0, 6), value: c.paid, color: 'var(--accent)' }))} />}
        <p className="vc-follow-t">{h.t}</p>
      </>
    );
  };

  return (
    <section id="vc-s-boards" className="vc-wrap vc-list-sec" aria-labelledby="vc-boards-title" onPointerMove={follow.onMove}>
      <header className="vc-list-head">
        <Kicker>07 · 看板</Kicker>
        <h2 id="vc-boards-title" className="vc-h2"><MaskText lines={[`${assets.length} 张看板`]} /></h2>
        <p className="vc-body">叙事讲完了，去看板里自己筛、自己查。每张看板都能点开单据，看到合同、报账、付款的完整链路。</p>
      </header>
      <ol className="vc-boards" onPointerLeave={follow.hide}>
        {assets.map((a, i) => {
          const h = headline(i);
          return (
            <li key={a.id} className={follow.active === i ? 'is-on' : ''} onPointerEnter={() => follow.show(i)}>
              <a href={href('c', 'board', a.id)} className="vc-board-link">
                <span className="vc-board-code vc-mono">{a.code}</span>
                <span className="vc-board-name">{a.name}<ArrowUpRight className="vc-board-arrow" size={44} strokeWidth={1.2} aria-hidden="true" /></span>
                <span className="vc-board-desc">{a.desc}</span>
                <span className="vc-board-meta vc-mono">{a.owner} · {a.source} · 更新 {a.updated}</span>
                <span className="vc-board-fig"><small>{h.k}</small>{h.v}</span>
              </a>
            </li>
          );
        })}
      </ol>
      <FollowCard follow={follow}>{preview(follow.active)}</FollowCard>
    </section>
  );
}
