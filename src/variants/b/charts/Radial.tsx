import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useElementSize } from '../../../core/fx/hooks';
import { useSite } from '../../../core/provider';
import { ringPath } from '../../../core/charts/scale';
import { useReveal } from '../lib';
import { Tip, TipRow, useKeyNav, useOutsideClear } from './common';

/* ───────── 同心环：每个型号一圈，中心是总完成率 ───────── */

export interface RingItem { key: string; label: string; ratio: number; color: string; display: string; detail?: ReactNode }

export function Rings({ items, centerValue, centerLabel, size = 220, ariaLabel, focus }: {
  items: RingItem[];
  centerValue: ReactNode;
  centerLabel: string;
  size?: number;
  ariaLabel: string;
  focus?: string | null;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const drawn = useReveal(wrap);
  const { fx } = useSite();
  const [hover, setHover] = useState<number | null>(null);
  useOutsideClear(wrap, hover !== null, () => setHover(null));
  const onKey = useKeyNav(items.length, hover, setHover);
  const sw = items.length > 3 ? 9 : 12, gap = 6;
  const R = size / 2 - sw / 2 - 2;
  const c = size / 2;
  const focusIdx = focus ? items.findIndex(it => it.key === focus) : -1;
  const act = hover ?? (focusIdx >= 0 ? focusIdx : null);

  return (
    <div ref={wrap} className={`vb-rings${drawn && fx.motion ? ' is-drawing' : ''}`} role="group" tabIndex={0} aria-label={`${ariaLabel}。用方向键逐个查看。`} onKeyDown={onKey} onBlur={() => setHover(null)}>
      <div className="vb-rings-fig" style={{ width: size, height: size }} onPointerLeave={e => { if (e.pointerType === 'mouse') setHover(null); }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={ariaLabel}>
          {items.map((it, i) => {
            const r = R - i * (sw + gap);
            const C = 2 * Math.PI * r;
            const len = Math.max(0, Math.min(1, it.ratio)) * C;
            const dim = act !== null && act !== i;
            return (
              <g key={it.key} className={dim ? 'is-dim' : undefined}>
                <circle className="vb-ring-track" cx={c} cy={c} r={r} strokeWidth={sw} />
                <circle className="vb-ring-arc" cx={c} cy={c} r={r} strokeWidth={sw} strokeLinecap="round"
                  strokeDasharray={`${len} ${C}`} transform={`rotate(-90 ${c} ${c})`}
                  style={{ stroke: it.color, ['--len' as string]: len, ['--i' as string]: i }} />
                <circle className="vb-ring-hit" cx={c} cy={c} r={r} strokeWidth={sw + gap} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} />
              </g>
            );
          })}
        </svg>
        <div className="vb-rings-center" aria-hidden="true">
          {act !== null ? <><b>{items[act].display}</b><span>{items[act].label}</span></> : <><b>{centerValue}</b><span>{centerLabel}</span></>}
        </div>
      </div>
      <ul className="vb-rings-list">
        {items.map((it, i) => (
          <li key={it.key} className={act === i ? 'is-on' : act !== null ? 'is-dim' : undefined} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
            <i className="vb-sw is-ring" style={{ borderColor: it.color }} aria-hidden="true" />
            <span>{it.label}</span>
            <b>{it.display}</b>
            {it.detail && <small>{it.detail}</small>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ───────── 环形扇区：部门占比 ───────── */

export interface DonutItem { key: string; label: string; value: number; color: string; display: string; share: string }

export function Donut({ items, size = 200, ariaLabel, centerValue, centerLabel, focus }: {
  items: DonutItem[];
  size?: number;
  ariaLabel: string;
  centerValue: ReactNode;
  centerLabel: string;
  focus?: string | null;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const drawn = useReveal(wrap);
  const { fx } = useSite();
  const [hover, setHover] = useState<number | null>(null);
  useOutsideClear(wrap, hover !== null, () => setHover(null));
  const onKey = useKeyNav(items.length, hover, setHover);
  const total = items.reduce((s, it) => s + it.value, 0) || 1;
  const c = size / 2, r1 = size / 2 - 4, r0 = r1 - 22;
  const gapA = items.length > 1 ? 0.025 : 0;
  let a = 0;
  const segs = items.map(it => {
    const span = (it.value / total) * Math.PI * 2;
    const s = { ...it, a0: a + gapA / 2, a1: a + span - gapA / 2 };
    a += span;
    return s;
  });
  const focusIdx = focus ? items.findIndex(it => it.key === focus) : -1;
  const act = hover ?? (focusIdx >= 0 ? focusIdx : null);
  return (
    <div ref={wrap} className={`vb-donut${drawn && fx.motion ? ' is-drawing' : ''}`} role="group" tabIndex={0} aria-label={`${ariaLabel}。用方向键逐个查看。`} onKeyDown={onKey} onBlur={() => setHover(null)}>
      <div className="vb-rings-fig" style={{ width: size, height: size }} onPointerLeave={e => { if (e.pointerType === 'mouse') setHover(null); }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={ariaLabel}>
          {segs.map((s, i) => (
            <path key={s.key} className={`vb-seg-arc${act !== null && act !== i ? ' is-dim' : ''}${act === i ? ' is-on' : ''}`}
              d={ringPath(c, c, r0, r1, s.a0, Math.max(s.a0 + 0.001, s.a1))} style={{ fill: s.color, ['--i' as string]: i }}
              onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} />
          ))}
        </svg>
        <div className="vb-rings-center" aria-hidden="true">
          {act !== null ? <><b>{items[act].share}</b><span>{items[act].label}</span></> : <><b>{centerValue}</b><span>{centerLabel}</span></>}
        </div>
      </div>
      <ul className="vb-rings-list">
        {items.map((it, i) => (
          <li key={it.key} className={act === i ? 'is-on' : act !== null ? 'is-dim' : undefined} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
            <i className="vb-sw is-dot" style={{ background: it.color }} aria-hidden="true" />
            <span>{it.label}</span>
            <b>{it.display}</b>
            <small>{it.share}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ───────── 气泡：外圈报账，内圈已付 ───────── */

export interface BubbleItem { key: string; label: string; value: number; inner: number; display: string; detail: ReactNode }

function pack(rs: number[]) {
  const pos: { x: number; y: number }[] = [];
  rs.forEach((r, i) => {
    if (i === 0) { pos.push({ x: 0, y: 0 }); return; }
    let best: { x: number; y: number; s: number } | null = null;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 48) {
      pos.forEach((p, j) => {
        const d = rs[j] + r + 0.06;
        const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
        if (pos.every((q, k) => Math.hypot(q.x - x, q.y - y) >= rs[k] + r + 0.05)) {
          const s = Math.hypot(x * 0.7, y * 1.5);
          if (!best || s < best.s) best = { x, y, s };
        }
      });
    }
    pos.push(best ?? { x: 0, y: 0 });
  });
  return pos;
}

export function Bubbles({ items, height = 260, ariaLabel, focus }: { items: BubbleItem[]; height?: number; ariaLabel: string; focus?: string | null }) {
  const wrap = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(wrap);
  const drawn = useReveal(wrap);
  const { fx } = useSite();
  const [hover, setHover] = useState<number | null>(null);
  useOutsideClear(wrap, hover !== null, () => setHover(null));
  const onKey = useKeyNav(items.length, hover, setHover);
  const max = Math.max(1, ...items.map(it => it.value));
  const rs = items.map(it => Math.sqrt(it.value / max));
  const pos = useMemo(() => pack(rs), [rs.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const w = Math.max(160, width), h = height;
  const minX = Math.min(...pos.map((p, i) => p.x - rs[i])), maxX = Math.max(...pos.map((p, i) => p.x + rs[i]));
  const minY = Math.min(...pos.map((p, i) => p.y - rs[i])), maxY = Math.max(...pos.map((p, i) => p.y + rs[i]));
  const k = Math.min((w - 16) / (maxX - minX || 1), (h - 16) / (maxY - minY || 1));
  const ox = w / 2 - ((minX + maxX) / 2) * k, oy = h / 2 - ((minY + maxY) / 2) * k;
  const focusIdx = focus ? items.findIndex(it => it.key === focus) : -1;
  const act = hover ?? (focusIdx >= 0 ? focusIdx : null);

  return (
    <div ref={wrap} className={`vb-chart vb-bubbles${drawn && fx.motion ? ' is-drawing' : ''}`} role="group" tabIndex={0} onKeyDown={onKey} onBlur={() => setHover(null)} aria-label={`${ariaLabel}。用方向键逐个查看。`}>
      {width > 0 && items.length > 0 && (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={ariaLabel} onPointerLeave={e => { if (e.pointerType === 'mouse') setHover(null); }}>
          {items.map((it, i) => {
            const R = rs[i] * k, cx = ox + pos[i].x * k, cy = oy + pos[i].y * k;
            const ri = R * Math.sqrt(Math.max(0, Math.min(1, it.inner / (it.value || 1))));
            return (
              <g key={it.key} className={`vb-bubble${act === i ? ' is-on' : ''}${act !== null && act !== i ? ' is-dim' : ''}`} style={{ ['--i' as string]: i, transformOrigin: `${cx}px ${cy}px` }}
                onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}>
                <circle className="vb-bubble-out" cx={cx} cy={cy} r={R - 1} />
                <circle className="vb-bubble-in" cx={cx} cy={cy} r={Math.max(0, ri - 3)} />
                {R > 30 && (
                  <text x={cx} y={cy} textAnchor="middle" className="vb-bubble-text">
                    <tspan x={cx} dy="-0.2em" className="is-label">{it.label}</tspan>
                    <tspan x={cx} dy="1.35em" className="is-value">{it.display}</tspan>
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {act !== null && width > 0 && items[act] && (() => {
        const i = act, R = rs[i] * k, cx = ox + pos[i].x * k, cy = oy + pos[i].y * k;
        const below = cy - R < 76;
        return (
          <Tip x={cx} y={below ? cy + R + 6 : cy - R - 6} width={w} below={below}>
            <div className="vb-tip-title">{items[i].label}</div>
            {items[i].detail}
          </Tip>
        );
      })()}
    </div>
  );
}

export { TipRow };
