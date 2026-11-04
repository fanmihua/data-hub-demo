import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useSite } from '../../../core/provider';
import { dateTimeLabel, pct, wanLabel } from '../../../core/data/format';
import { clamp } from '../lib';
import { Kicker } from '../ui';

type Piece = { t: string; em?: boolean; strong?: boolean };

/**
 * 「长文逐行点亮」：一段总结随滚动逐行由灰变黑，关键数字用主色。
 * 做法：每个字一个 span，排版后按 offsetTop 分行，把行号写进 --l；
 * 滚动时只改容器上的一个 --lit，每个字的不透明度由 CSS calc 算出（只动 opacity）。
 */
export function LitText() {
  const { derived, fx, data } = useSite();
  const box = useRef<HTMLParagraphElement>(null);

  const pieces = useMemo<Piece[]>(() => {
    const b = derived.business, s = derived.spend;
    const low = [...derived.models].sort((a, z) => a.completion - z.completion)[0];
    const topSys = derived.bySystem[0];
    const owe = [...derived.bills].sort((a, z) => z.unpaid - a.unpaid)[0];
    const asOf = dateTimeLabel(data.meta.asOf).slice(0, 10);
    const out: Piece[] = [
      { t: `截至 ${asOf}，${derived.models.length} 个型号共实现收入 ` }, { t: wanLabel(b.revenue, 0), em: true },
      { t: '，完成年度目标的 ' }, { t: pct(b.completion), em: true }, { t: '；回款 ' }, { t: wanLabel(b.received, 0), strong: true }, { t: '。' },
      { t: `支出一侧，${s.billCount} 张报账单合计 ` }, { t: wanLabel(s.billed, 0), strong: true }, { t: '，已经付出 ' }, { t: wanLabel(s.paid, 0), em: true },
      { t: '，还有 ' }, { t: wanLabel(s.unpaid, 0), em: true }, { t: '在路上。' },
    ];
    if (topSys) out.push({ t: `花得最多的是${topSys.key}，` });
    if (low) out.push({ t: `完成率最低的是 ${low.id}，为 ` }, { t: pct(low.completion), em: true }, { t: '。' });
    if (owe && owe.unpaid > 0) out.push({ t: '接下来要盯的，是「' }, { t: owe.summary, strong: true }, { t: `」这类已经报账、还没付款的单子，它还差 ${wanLabel(owe.unpaid, 0)}。` });
    return out;
  }, [derived, data.meta.asOf]);

  // 拆成字（数字与英文串保持完整）
  const chars = useMemo(() => pieces.flatMap((p, pi) => (p.t.match(/[A-Za-z0-9.,%\-]+|\s+|./gu) ?? []).map((c, ci) => ({ c, k: `${pi}-${ci}`, em: p.em, strong: p.strong }))), [pieces]);

  // 分行：同一 offsetTop 的字算一行
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const assign = () => {
      let line = -1, lastTop = -Infinity;
      el.querySelectorAll<HTMLElement>('.vc-lit-c').forEach(s => {
        const top = s.offsetTop;
        if (top > lastTop + 4) { line += 1; lastTop = top; }
        s.style.setProperty('--l', String(line));
      });
      el.style.setProperty('--lines', String(line + 1));
    };
    assign();
    const ro = new ResizeObserver(assign);
    ro.observe(el);
    return () => ro.disconnect();
  }, [chars]);

  // 滚动：阅读线在视口 62% 处，行越过阅读线即点亮
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (!fx.motion) { el.style.setProperty('--lit', '999'); return; }
    let raf = 0;
    const paint = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const lines = Number(el.style.getPropertyValue('--lines')) || 1;
      const lh = r.height / lines;
      const read = window.innerHeight * 0.62;
      el.style.setProperty('--lit', clamp((read - r.top) / lh + 0.4, 0, lines + 1).toFixed(3));
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(paint); };
    paint();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', on); window.removeEventListener('resize', on); };
  }, [fx.motion, chars]);

  return (
    <section id="vc-s-summary" className="vc-wrap vc-lit" aria-labelledby="vc-lit-title">
      <div className="vc-lit-side">
        <Kicker>05 · 小结</Kicker>
        <h2 id="vc-lit-title" className="vc-lit-h">这一年，钱走到了哪里</h2>
      </div>
      <p ref={box} className="vc-lit-p">
        <span className="vc-sr">{pieces.map(p => p.t).join('')}</span>
        {chars.map(ch => <span key={ch.k} aria-hidden="true" className={`vc-lit-c ${ch.em ? 'is-em' : ''} ${ch.strong ? 'is-strong' : ''}`}>{ch.c}</span>)}
      </p>
    </section>
  );
}
