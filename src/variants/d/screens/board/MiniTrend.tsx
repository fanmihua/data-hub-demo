import { useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { useSite } from '../../../../core/provider';
import { smoothPath, type Pt } from '../../../../core/charts/scale';
import { monthShort } from '../../../../core/data/format';
import { Tip, TipHead, TipRow } from '../../viz';
import { EASE, useBox, useEntrance } from '../../viz/util';
import type { ChartType } from '../../model/types';

/**
 * 数据流小卡里的迷你趋势：跟随容器尺寸，line / area 画平滑曲线，bar 画迷你柱。
 * 悬停（或触控点按）出十字点和提示框，显示那个月的取值；末端圆点带呼吸光环。
 * 纯辅助图形：数值在卡片里另有文字，所以 aria-hidden。
 */
export function MiniTrend({ values, months, type = 'line', color, format, label }: {
  values: number[];
  months: string[];
  type?: ChartType;
  color: string;
  format: (v: number) => string;
  label: string;
}) {
  const { fx } = useSite();
  const box = useRef<HTMLDivElement>(null);
  const { width, height } = useBox(box);
  const [hi, setHi] = useState<number | null>(null);
  const gid = useRef(`vd-mt-${Math.random().toString(36).slice(2, 8)}`).current;

  const geo = useMemo(() => {
    if (width < 8 || height < 8 || !values.length) return null;
    const pad = 4, n = values.length;
    const max = Math.max(...values), min = type === 'bar' ? 0 : Math.min(...values);
    const span = max - min || 1;
    const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2);
    if (type === 'bar') {
      const step = width / n, bw = Math.max(2, Math.min(14, step * 0.5));
      const bars = values.map((v, i) => {
        const h = Math.max(v > 0 ? 1.5 : 0, (height - pad) * (max ? v / max : 0));
        return { x: i * step + (step - bw) / 2, y: height - h, w: bw, h, cx: i * step + step / 2 };
      });
      return { kind: 'bar' as const, bars, xs: bars.map(b => b.cx) };
    }
    const pts: Pt[] = values.map((v, i) => [n === 1 ? width / 2 : pad + (i / (n - 1)) * (width - pad * 2), y(v)]);
    const line = smoothPath(pts);
    const area = `${line}L${pts[n - 1][0].toFixed(2)},${height}L${pts[0][0].toFixed(2)},${height}Z`;
    return { kind: 'line' as const, pts, line, area, xs: pts.map(p => p[0]) };
  }, [values, width, height, type]);

  useEntrance(box, el => {
    const out: Animation[] = [];
    el.querySelectorAll('.vd-mt-line').forEach(p => out.push(p.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 900, easing: EASE, fill: 'backwards' })));
    el.querySelectorAll('.vd-mt-area').forEach(p => out.push(p.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, delay: 250, easing: EASE, fill: 'backwards' })));
    el.querySelectorAll('.vd-mt-bar').forEach((b, i) => out.push(b.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 640, delay: i * 50, easing: EASE, fill: 'backwards' })));
    return out;
  }, { enabled: fx.motion, ready: !!geo, key: `${type}|${values.join(',')}` });

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!geo) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    let best = 0;
    geo.xs.forEach((x, i) => { if (Math.abs(x - px) < Math.abs(geo.xs[best] - px)) best = i; });
    setHi(best);
  };
  const tip = (() => {
    if (hi === null || !geo || !box.current) return null;
    const r = box.current.getBoundingClientRect();
    const yy = geo.kind === 'bar' ? geo.bars[hi].y : geo.pts[hi][1];
    return { x: r.left + geo.xs[hi], y: r.top + yy };
  })();
  const n = values.length;

  return (
    <div ref={box} className={`vd-mt is-${type === 'bar' ? 'bar' : type}`} style={{ '--c': color } as CSSProperties}
      onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHi(null)} aria-hidden="true">
      {geo && (
        <svg width={width} height={height}>
          {geo.kind === 'bar' ? (
            geo.bars.map((b, i) => (
              <rect key={i} className={`vd-mt-bar${hi !== null && hi !== i ? ' is-dim' : ''}${i === n - 1 ? ' is-last' : ''}`}
                x={b.x} y={b.y} width={b.w} height={b.h} rx={Math.min(2, b.w / 2)} />
            ))
          ) : (
            <>
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" style={{ stopColor: color, stopOpacity: type === 'area' ? 0.26 : 0.12 }} />
                  <stop offset="1" style={{ stopColor: color, stopOpacity: 0 }} />
                </linearGradient>
              </defs>
              <path className="vd-mt-area" d={geo.area} fill={`url(#${gid})`} />
              <path className="vd-mt-line" d={geo.line} pathLength={1} strokeDasharray="1" />
              {hi !== null && <line className="vd-mt-cross" x1={geo.xs[hi]} x2={geo.xs[hi]} y1={0} y2={height} />}
              {fx.motion && hi === null && <circle className="vd-mt-ping" cx={geo.pts[n - 1][0]} cy={geo.pts[n - 1][1]} r={3} />}
              <circle className="vd-mt-dot" cx={geo.pts[hi ?? n - 1][0]} cy={geo.pts[hi ?? n - 1][1]} r={hi === null ? 2.6 : 3.4} />
            </>
          )}
        </svg>
      )}
      {tip && hi !== null && (
        <Tip x={tip.x} y={tip.y} placement="above">
          <TipHead>{monthShort(months[hi])}</TipHead>
          <TipRow color={color} kind={type === 'bar' ? 'solid' : 'line'} label={label} value={format(values[hi])} />
        </Tip>
      )}
    </div>
  );
}
