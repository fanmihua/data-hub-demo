import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject, type PointerEvent } from 'react';
import { useSite } from '../../../core/provider';
import { dpr, useRafLoop } from '../../../core/fx/hooks';
import { NumberRoller } from '../../../core/ui/NumberRoller';
import { pct, wan } from '../../../core/data/format';
import { clamp, mulberry, useModelColor, useScrollProgress, useSize, useThemeColors } from '../lib';
import { Kicker, MaskText, Swap, Tip } from '../ui';

const COLOR_KEYS = ['--vc-m1', '--vc-m2', '--vc-m3', '--vc-ink', '--vc-ink-2', '--vc-ink-3', '--vc-line', '--vc-bg', '--accent-rgb'] as const;

/** 三条轨道的几何参数：相对外轨的大小、倾角、起始相位 */
const ORBITS = [
  { k: 0.47, tilt: -0.34, start: 2.3 },
  { k: 0.73, tilt: -0.26, start: 0.85 },
  { k: 1.0, tilt: -0.19, start: -0.6 },
];
const SWEEP = Math.PI * 2 * 0.84;

interface Sat { id: string; x: number; y: number; r: number }

/**
 * 滚动驱动的轨道系统（Canvas 2D）。
 * - 每个型号一条椭圆轨道；卫星走过的角度 = 累计收入 / 全年收入，所以收入多的月份走得快；
 * - 卫星大小对应累计收入；走过的轨迹是渐变实线，未走的是虚线，月份刻度点在轨道上；
 * - tRef 是「第几个月」的小数值，由页面滚动驱动；关闭特效时停在终态，不跑循环；
 * - 深色：星点 + 中心淡光；浅色：只留发丝线和十字基准线。
 */
function OrbitCanvas({ tRef, hover, setHover, redrawKey }: { tRef: MutableRefObject<number>; hover: string | null; setHover: (id: string | null) => void; redrawKey: number }) {
  const { derived, fx, isDark } = useSite();
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const { width, height } = useSize(wrap);
  const colors = useThemeColors(COLOR_KEYS, wrap);
  const models = derived.models;
  const n = derived.months.length;
  const cum = useMemo(() => models.map(m => { let s = 0; return m.monthly.map(v => (s += v)); }), [models]);
  const maxTotal = Math.max(1, ...cum.map(c => c[c.length - 1] ?? 0));
  const stars = useMemo(() => { const r = mulberry(11); return Array.from({ length: 150 }, () => ({ x: r(), y: r(), s: r(), p: r() * Math.PI * 2 })); }, []);
  const sats = useRef<Sat[]>([]);
  const hoverRef = useRef<string | null>(hover);
  hoverRef.current = hover;

  useEffect(() => {
    const c = canvas.current;
    if (!c || !width || !height) return;
    const k = dpr(2);
    c.width = Math.round(width * k);
    c.height = Math.round(height * k);
  }, [width, height]);

  const draw = useCallback((time: number) => {
    const c = canvas.current;
    if (!c || !colors || !width || !height) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const k = dpr(2);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const t = clamp(tRef.current, 0, Math.max(0, n - 1));
    const i0 = Math.floor(t), f = t - i0;
    const I = fx.intensity;
    // 宽屏时画布铺满首屏、轨道中心偏右，标题压在左侧；窄屏时画布单独一块，居中
    const wide = width >= 860;
    const cx = width * (wide ? 0.63 : 0.5), cy = height * (wide ? 0.5 : 0.5);
    const R = wide ? Math.min(width * 0.36, height * 0.92) : Math.min(width * 0.43, height * 1.0);
    const ink = colors['--vc-ink'], ink2 = colors['--vc-ink-2'], ink3 = colors['--vc-ink-3'], line = colors['--vc-line'];
    const mColor = [colors['--vc-m1'], colors['--vc-m2'], colors['--vc-m3']];

    // 背景：深色是星点，浅色只有十字基准线
    if (isDark) {
      for (const s of stars) {
        const tw = fx.motion ? 0.55 + 0.45 * Math.sin(time * (0.6 + s.s) + s.p) * I : 0.7;
        ctx.globalAlpha = (0.12 + 0.4 * s.s) * tw;
        ctx.fillStyle = ink;
        ctx.fillRect(s.x * width, s.y * height, s.s > 0.85 ? 1.6 : 1, s.s > 0.85 ? 1.6 : 1);
      }
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.6);
      g.addColorStop(0, `rgba(${colors['--accent-rgb'].split(/\s+/).join(',')},${0.16 * (0.5 + I * 0.5)})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(cx - R * 1.05, cy); ctx.lineTo(cx + R * 1.05, cy);
    ctx.moveTo(cx, cy - R * 0.5); ctx.lineTo(cx, cy + R * 0.5);
    ctx.stroke();
    // 刻度：基准线两端的小标
    ctx.font = '10px ui-monospace, "SF Mono", Menlo, monospace';
    ctx.fillStyle = ink3;
    ctx.textAlign = 'right';
    if (wide) ctx.fillText('ORBIT PLANE · FY' + derived.meta.fiscalYear, Math.min(width - 8, cx + R * 1.05), cy + 16);

    const pos = (o: typeof ORBITS[number], rx: number, th: number) => {
      const px = rx * Math.cos(th), py = rx * 0.4 * Math.sin(th);
      const ct = Math.cos(o.tilt), st = Math.sin(o.tilt);
      return [cx + px * ct - py * st, cy + px * st + py * ct] as const;
    };

    const hov = hoverRef.current;
    const nextSats: Sat[] = [];
    models.forEach((m, mi) => {
      const o = ORBITS[mi % ORBITS.length];
      const rx = R * o.k;
      const col = mColor[mi % 3];
      const total = cum[mi][cum[mi].length - 1] || 1;
      const now = (cum[mi][i0] ?? 0) + f * ((cum[mi][i0 + 1] ?? cum[mi][i0] ?? 0) - (cum[mi][i0] ?? 0));
      const th = o.start + SWEEP * (now / total);
      const dim = hov && hov !== m.id ? 0.35 : 1;

      // 整条轨道：虚线
      ctx.globalAlpha = dim;
      ctx.strokeStyle = line;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 5]);
      ctx.beginPath();
      for (let j = 0; j <= 96; j++) { const [x, y] = pos(o, rx, (j / 96) * Math.PI * 2); if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke();
      ctx.setLineDash([]);

      // 走过的轨迹：从起点到卫星，透明度渐强
      const steps = 72;
      ctx.strokeStyle = col;
      ctx.lineWidth = hov === m.id ? 3 : 2;
      ctx.lineCap = 'round';
      let [px0, py0] = pos(o, rx, o.start);
      for (let j = 1; j <= steps; j++) {
        const a = o.start + ((th - o.start) * j) / steps;
        const [x, y] = pos(o, rx, a);
        ctx.globalAlpha = dim * (0.12 + 0.88 * (j / steps) ** 1.4);
        ctx.beginPath(); ctx.moveTo(px0, py0); ctx.lineTo(x, y); ctx.stroke();
        px0 = x; py0 = y;
      }

      // 起点与月份刻度
      ctx.globalAlpha = dim;
      const [sx, sy] = pos(o, rx, o.start);
      ctx.strokeStyle = ink3;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(sx, sy, 3, 0, Math.PI * 2); ctx.stroke();
      cum[mi].forEach((cv, j) => {
        const [x, y] = pos(o, rx, o.start + SWEEP * (cv / total));
        const passed = j <= t + 1e-6;
        ctx.fillStyle = passed ? col : ink3;
        ctx.globalAlpha = dim * (passed ? 0.9 : 0.45);
        ctx.beginPath(); ctx.arc(x, y, passed ? 2.2 : 1.6, 0, Math.PI * 2); ctx.fill();
      });

      // 卫星：大小对应累计收入，靠前（下半圈）略大，模拟纵深
      const [x, y] = pos(o, rx, th);
      const depth = 0.84 + 0.16 * ((Math.sin(th) + 1) / 2);
      const r = (4 + (wide ? 17 : 12) * Math.sqrt(now / maxTotal)) * depth;
      if (fx.motion) {
        const ph = (time * 0.45 + mi * 0.31) % 1;
        ctx.globalAlpha = dim * (1 - ph) * 0.4 * I;
        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, y, r + 4 + ph * 22, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = dim * 0.28;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, r + 5, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = dim;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();

      // 标签：沿离心方向放
      const dx = x - cx, dy = y - cy, dl = Math.hypot(dx, dy) || 1;
      let lx = x + (dx / dl) * (r + 14);
      const ly = y + (dy / dl) * (r + 10);
      const valText = `${wan(now, 0)} 万`;
      ctx.font = '600 13px ui-monospace, "SF Mono", Menlo, monospace';
      const tw = Math.max(ctx.measureText(m.id).width, ctx.measureText(valText).width + 4);
      ctx.textAlign = dx >= 0 ? 'left' : 'right';
      // 标签不出画布：靠边时贴边放
      if (dx >= 0 && lx + tw > width - 6) lx = width - 6 - tw;
      if (dx < 0 && lx - tw < 6) lx = 6 + tw;
      ctx.fillStyle = ink;
      ctx.fillText(m.id, lx, ly - 2);
      ctx.font = '12px ui-monospace, "SF Mono", Menlo, monospace';
      ctx.fillStyle = ink2;
      ctx.fillText(valText, lx, ly + 13);
      nextSats.push({ id: m.id, x, y, r });
    });
    ctx.globalAlpha = 1;

    // 中心
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = ink3;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.stroke();
    if (fx.motion) {
      ctx.setLineDash([3, 6]);
      ctx.lineDashOffset = -time * 8 * I;
      ctx.beginPath(); ctx.arc(cx, cy, 24, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    sats.current = nextSats;
  }, [colors, width, height, n, fx.intensity, fx.motion, isDark, models, cum, maxTotal, stars, tRef, derived.meta.fiscalYear]);

  useRafLoop(time => draw(time), { active: fx.motion && !!colors && width > 0, target: wrap });
  useEffect(() => { if (!fx.motion) draw(0); }, [fx.motion, draw, redrawKey, hover]);

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    let best: Sat | null = null, bd = Infinity;
    sats.current.forEach(s => { const d = Math.hypot(s.x - x, s.y - y); if (d < s.r + 16 && d < bd) { bd = d; best = s; } });
    setHover((best as Sat | null)?.id ?? null);
  };

  const hs = hover ? sats.current.find(s => s.id === hover) : null;
  const hm = hover ? models.find(m => m.id === hover) : null;
  const mi = Math.round(clamp(tRef.current, 0, n - 1));
  const hmIndex = hm ? models.indexOf(hm) : -1;

  return (
    <div className={`vc-orbit ${hover ? 'is-hover' : ''}`} ref={wrap} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={e => { if (e.pointerType === 'mouse') setHover(null); }}>
      <canvas ref={canvas} role="img" aria-label={`轨道示意：${models.map(m => `${m.id} 全年收入 ${wan(m.revenue, 0)} 万元`).join('，')}。卫星越大，累计收入越多。`} />
      {hs && hm && (
        <Tip x={hs.x} y={hs.y} width={width}>
          <p className="vc-tip-h">{hm.id} · {hm.dept}</p>
          <p className="vc-tip-row">{derived.monthLabels[mi]}收入<b>{wan(hm.monthly[mi] ?? 0)} 万元</b></p>
          <p className="vc-tip-row">累计收入<b>{wan(cum[hmIndex][mi] ?? 0)} 万元</b></p>
          <p className="vc-tip-row">全年完成<b>{pct(hm.completion)}</b></p>
        </Tip>
      )}
    </div>
  );
}

export function Hero() {
  const { derived, fx, data } = useSite();
  const color = useModelColor();
  const n = derived.months.length;
  const track = useRef<HTMLElement>(null);
  const tRef = useRef(fx.motion ? 0 : n - 1);
  const [mi, setMi] = useState(fx.motion ? 0 : n - 1);
  const [staticT, setStaticT] = useState(n - 1);
  const [hover, setHover] = useState<string | null>(null);

  useScrollProgress(track, p => {
    if (!fx.motion) return;
    const t = p * Math.max(0, n - 1);
    tRef.current = t;
    setMi(Math.round(t));
  }, { enabled: fx.motion });

  useEffect(() => {
    if (fx.motion) return;
    tRef.current = staticT;
    setMi(staticT);
  }, [fx.motion, staticT]);

  const goMonth = (i: number) => {
    if (!fx.motion) { setStaticT(i); return; }
    const el = track.current;
    if (!el) return;
    const span = el.offsetHeight - window.innerHeight;
    const top = el.getBoundingClientRect().top + window.scrollY + (span * i) / Math.max(1, n - 1);
    window.scrollTo({ top: top + 2, behavior: 'smooth' });
  };

  const cumTotal = derived.monthlyRevenue.slice(0, mi + 1).reduce((s, x) => s + x.total, 0);
  const monthTotal = derived.monthlyRevenue[mi]?.total ?? 0;
  const first = derived.monthLabels[0] ?? '', last = derived.monthLabels[n - 1] ?? '';

  return (
    <section id="vc-s-hero" ref={track} className="vc-track vc-hero" style={{ '--vc-track': `${Math.max(2, n) * 52 + 40}vh` } as CSSProperties} aria-labelledby="vc-hero-title">
      <div className="vc-sticky vc-hero-sticky">
        <OrbitCanvas tRef={tRef} hover={hover} setHover={setHover} redrawKey={staticT} />
        <div className="vc-hero-copy">
          <Kicker>01 · FY{data.meta.fiscalYear} · 演示数据</Kicker>
          <h1 id="vc-hero-title" className="vc-hero-title"><MaskText lines={['经费', '在轨']} stagger={140} duration={1300} /></h1>
          <p className="vc-lead">
            {data.meta.fiscalYear} 年，{derived.models.length} 个型号的经费从目标出发，走向合同、报账和付款。
            <span className="vc-lead-hint">{fx.motion ? `向下滚动，时间从 ${first} 走到 ${last}。` : `点下面的月份，看卫星走到哪里。`}</span>
          </p>
        </div>

        <div className="vc-hero-readout" aria-live="polite">
          <div className="vc-hero-month">
            <span className="vc-hero-month-k vc-mono">MONTH</span>
            <Swap key={mi} className="vc-hero-month-v">{derived.monthLabels[mi]}</Swap>
          </div>
          <dl className="vc-hero-figs">
            <div><dt>当月收入</dt><dd><NumberRoller value={monthTotal} format={v => wan(v)} className="vc-num" /><small>万元</small></dd></div>
            <div><dt>累计收入</dt><dd><NumberRoller value={cumTotal} format={v => wan(v)} className="vc-num" /><small>万元</small></dd></div>
          </dl>
          <ul className="vc-hero-models">
            {derived.models.map(m => {
              const c = m.monthly.slice(0, mi + 1).reduce((s, v) => s + v, 0);
              return (
                <li key={m.id} className={hover && hover !== m.id ? 'is-dim' : ''} onPointerEnter={() => setHover(m.id)} onPointerLeave={() => setHover(null)}>
                  <i className="vc-sw is-solid" style={{ '--c': color(m.id) } as CSSProperties} aria-hidden="true" />
                  <b>{m.id}</b><span>{wan(c, 0)} 万</span>
                </li>
              );
            })}
          </ul>
          <div className="vc-scrub" role="group" aria-label="选择月份">
            <span className="vc-scrub-bar" aria-hidden="true"><i style={{ transform: `scaleX(${n > 1 ? mi / (n - 1) : 1})` }} /></span>
            {derived.months.map((m, i) => (
              <button key={m} type="button" aria-pressed={i === mi} onClick={() => goMonth(i)}>{derived.monthLabels[i]}</button>
            ))}
          </div>
        </div>

        {fx.motion && <p className="vc-hero-cue vc-mono" aria-hidden="true"><i />SCROLL · 时间推进</p>}
      </div>
    </section>
  );
}
