import { useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { useSite } from '../../../core/provider';
import { pct } from '../../../core/data/format';
import { Tip, TipHead, TipRow } from './Tip';
import { EASE, signature, useBox, useEntrance } from './util';
import './viz.css';

export interface RingItem { key: string; label: string; ratio: number; color: string }

/**
 * 同心进度环：每个 item 一圈，ratio 为 0–1（超过 1 时画满并在图例里如实显示百分比）。
 * - center 叠在环心（例如合计完成率的大数字）；
 * - 图例在右侧（容器够宽）或下方，悬停环或图例行互相联动，其余变淡；
 * - 首次进入视口时各环依次描出。
 */
export function Ring({ items, center, ariaLabel }: { items: RingItem[]; center: ReactNode; ariaLabel: string }) {
  const { fx } = useSite();
  const root = useRef<HTMLDivElement>(null);
  const fig = useRef<HTMLDivElement>(null);
  const { width, height } = useBox(root);
  const [hi, setHi] = useState<number | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);

  const row = width >= height * 1.35 && width >= 260;
  const legendH = items.length * 26 + 8;
  const size = Math.max(96, Math.floor(row ? Math.min(height, width * 0.52) : Math.min(width, Math.max(96, height - legendH - 12))));
  const n = Math.max(1, items.length);
  const sw = Math.max(5, Math.min(10, (size * 0.26) / (n * 1.5)));
  const gap = Math.max(3, sw * 0.45);
  const c = size / 2;
  const radius = (i: number) => c - sw / 2 - 2 - i * (sw + gap);

  useEntrance(root, el => {
    const out: Animation[] = [];
    el.querySelectorAll<SVGCircleElement>('.vd-ring-arc').forEach((arc, i) => {
      const len = Number(arc.getAttribute('data-len') || 0);
      out.push(arc.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 1100, delay: 120 + i * 110, easing: EASE, fill: 'backwards' }));
    });
    el.querySelectorAll('.vd-ring-legend li, .vd-ring-center').forEach((li, i) => {
      out.push(li.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 480, delay: 260 + i * 60, easing: EASE, fill: 'backwards' }));
    });
    return out;
  }, { enabled: fx.motion, ready: width > 0, key: signature(items.map(i => i.key)) });

  const showAt = (i: number) => {
    setHi(i);
    const r = fig.current?.getBoundingClientRect();
    if (!r) return;
    const rr = radius(i);
    setTip({ x: r.left + c + rr * 0.72, y: r.top + c - rr * 0.72 });
  };
  const hide = () => { setHi(null); setTip(null); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); showAt(Math.min(items.length - 1, (hi ?? -1) + 1)); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); showAt(Math.max(0, (hi ?? items.length) - 1)); }
    else if (e.key === 'Escape') hide();
  };
  const it = hi !== null ? items[hi] : null;

  return (
    <div ref={root} className={`vd-viz vd-ring${row ? ' is-row' : ''}`} role="group" tabIndex={0}
      aria-label={`${ariaLabel}。${items.map(i => `${i.label} ${pct(i.ratio)}`).join('，')}。可用方向键逐个查看。`}
      onKeyDown={onKey} onBlur={hide} onPointerLeave={e => { if (e.pointerType === 'mouse') hide(); }}>
      {width > 0 && (
        <div ref={fig} className="vd-ring-fig" style={{ width: size, height: size }}>
          <svg width={size} height={size} aria-hidden="true">
            {items.map((item, i) => {
              const r = radius(i);
              if (r <= sw) return null;
              const C = 2 * Math.PI * r;
              const len = Math.max(0.001, Math.min(1, Math.max(0, item.ratio))) * C;
              return (
                <g key={item.key} className={`vd-ring-g${hi !== null && hi !== i ? ' is-dim' : ''}${hi === i ? ' is-on' : ''}`} transform={`rotate(-90 ${c} ${c})`}>
                  <circle cx={c} cy={c} r={r} className="vd-ring-track" style={{ strokeWidth: sw }} />
                  <circle cx={c} cy={c} r={r} className="vd-ring-arc" data-len={len}
                    style={{ stroke: item.color, strokeWidth: sw, strokeDasharray: `${len} ${C}` } as CSSProperties} />
                  <circle cx={c} cy={c} r={r} className="vd-ring-hit" style={{ strokeWidth: sw + gap }}
                    onPointerEnter={() => showAt(i)} onPointerDown={() => showAt(i)} />
                </g>
              );
            })}
          </svg>
          <div className="vd-ring-center">{center}</div>
        </div>
      )}
      <ul className="vd-ring-legend" aria-hidden="true">
        {items.map((item, i) => (
          <li key={item.key} className={`${hi !== null && hi !== i ? 'is-dim' : ''}${hi === i ? ' is-on' : ''}`}
            onPointerEnter={() => showAt(i)} onPointerDown={() => showAt(i)}>
            <i style={{ background: item.color }} />
            <span>{item.label}</span>
            <b>{pct(item.ratio)}</b>
          </li>
        ))}
      </ul>
      {it && tip && (
        <Tip x={tip.x} y={tip.y}>
          <TipHead>{it.label}</TipHead>
          <TipRow color={it.color} label="比例" value={pct(it.ratio)} />
        </Tip>
      )}
    </div>
  );
}
