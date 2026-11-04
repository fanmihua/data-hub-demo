import { Fragment, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { useSite } from '../../../core/provider';
import { areaPath, barPath, nearestIndex, niceMax, scaleLinear, smoothPath, type Pt } from '../../../core/charts/scale';
import { Tip, TipHead, TipRow } from './Tip';
import { playIn, signature, textWidth, useBox, useEntrance } from './util';
import './viz.css';

export interface Series { id: string; label: string; color: string; values: number[] }
export interface Note { index: number; text: string }

type ChartType = 'line' | 'area' | 'bar' | 'table';

/**
 * 时间序列图：折线 / 面积（多系列时堆叠）/ 分组柱 / 数据表。
 * - 十字线 + 提示框（鼠标移动、触控点按、键盘左右键）；
 * - 注释：竖向虚线 + 编号圆点 + 旁注文字；
 * - 首次进入视口时描线（折线）、揭开（面积）、生长（柱）；换类型、换系列或收到重播事件时再播一次；
 * - 两个及以上系列时自动显示图例，并在末端直接标数（空间够时）；
 * - height 为 '100%' 时跟随父容器高度（父容器要有确定高度，例如 grid 单元 + min-height: 0）。
 */
export function TimeSeries({ labels, series, type, notes: rawNotes = [], height = 240, ariaLabel, valueFormat, unit }: {
  labels: string[];
  series: Series[];
  type: ChartType;
  notes?: Note[];
  height?: number | '100%';
  ariaLabel: string;
  valueFormat: (n: number) => string;
  /** 可选：数值轴单位，写在纵轴顶端（例如「万元」） */
  unit?: string;
}) {
  const { fx } = useSite();
  const uid = useId().replace(/:/g, '');
  const root = useRef<HTMLDivElement>(null);
  const plot = useRef<HTMLDivElement>(null);
  const { width, height: ph } = useBox(plot);
  const [hi, setHi] = useState<number | null>(null);
  const [hiSeries, setHiSeries] = useState<number | null>(null);
  const n = labels.length;
  // 只保留落在范围内的注释，编号按出现顺序 1、2、3
  const notes = rawNotes.filter(x => x.index >= 0 && x.index < n);
  const multi = series.length > 1;
  const stacked = type === 'area' && multi;

  // 数值域：堆叠面积按合计，其余按单值
  const totals = useMemo(() => labels.map((_, i) => series.reduce((s, x) => s + (x.values[i] ?? 0), 0)), [labels, series]);
  const rawMax = stacked ? Math.max(0, ...totals) : Math.max(0, ...series.flatMap(s => s.values));
  const rawMin = stacked ? 0 : Math.min(0, ...series.flatMap(s => s.values));
  const max = niceMax(Math.max(rawMax, 1e-9), 4);
  const min = rawMin < 0 ? -niceMax(-rawMin, 4) : 0;

  // 边距：左侧按最长刻度留宽；多系列且够宽时右侧留出末端标签位
  const tickVals = scaleLinear([min, max], [0, 1]).ticks(ph < 150 ? 2 : 4);
  const tickW = Math.max(...tickVals.map(t => textWidth(valueFormat(t), 11)));
  const endLabels = type !== 'bar' && width >= 420;
  const endW = endLabels ? Math.min(120, Math.max(...series.map(s => Math.max(textWidth(s.label, 11), textWidth(valueFormat(s.values[n - 1] ?? 0), 11.5)))) + 18) : 0;
  const m = { t: notes.length || unit ? 30 : 12, r: endLabels ? endW : 10, b: 24, l: Math.ceil(Math.min(72, Math.max(24, tickW + 10))) };
  const iw = Math.max(10, width - m.l - m.r), ih = Math.max(10, ph - m.t - m.b);
  const y = scaleLinear([min, max], [m.t + ih, m.t]);
  const base = y(Math.max(0, min));

  // x：折线 / 面积用点，柱用分格
  const step = n ? iw / n : 0;
  const xs = labels.map((_, i) => (type === 'bar' ? m.l + i * step + step / 2 : m.l + (n <= 1 ? iw / 2 : (i * iw) / (n - 1))));
  const labelEvery = Math.max(1, Math.ceil((n * 40) / Math.max(1, iw)));
  const showLabel = (i: number) => {
    if (hi === i) return true;
    if (hi !== null && Math.abs(xs[i] - xs[hi]) < 38) return false;
    return i % labelEvery === 0 || (i === n - 1 && (n - 1) % labelEvery >= Math.ceil(labelEvery / 2));
  };

  // 柱：分组，≤24px，组内间距 3px
  const gap = 3;
  const bw = Math.max(3, Math.min(24, (step * 0.64 - gap * (series.length - 1)) / Math.max(1, series.length)));
  const groupW = bw * series.length + gap * (series.length - 1);

  // 堆叠面积的上下沿
  const stacks = useMemo(() => {
    if (!stacked) return null;
    const acc = labels.map(() => 0);
    return series.map(s => {
      const lower = acc.slice();
      s.values.forEach((v, i) => { acc[i] += v ?? 0; });
      return { lower, upper: acc.slice() };
    });
  }, [stacked, labels, series]);

  // 末端标签：按 y 排序，保证最小间距
  const ends = useMemo(() => {
    if (!endLabels || !n) return [];
    const arr = series.map((s, si) => {
      const v = stacked && stacks ? stacks[si].upper[n - 1] : s.values[n - 1] ?? 0;
      return { s, y: y(v), v: s.values[n - 1] ?? 0 };
    }).sort((a, b) => a.y - b.y);
    for (let i = 1; i < arr.length; i++) if (arr[i].y - arr[i - 1].y < 28) arr[i].y = arr[i - 1].y + 28;
    return arr;
  }, [endLabels, n, series, stacked, stacks, ph, max, min]); // eslint-disable-line react-hooks/exhaustive-deps

  // 单系列：标出峰值
  const peak = useMemo(() => {
    if (multi || !series[0] || !n || type === 'table') return null;
    let k = 0;
    series[0].values.forEach((v, i) => { if (v > (series[0].values[k] ?? -Infinity)) k = i; });
    return k;
  }, [multi, series, n, type]);

  const sig = signature([type, n, ...series.map(s => s.id)]);
  useEntrance(root, el => playIn(el, { duration: 900 }), { enabled: fx.motion && type !== 'table', ready: width > 0, key: sig });

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    if (px < m.l - 8 || px > width - m.r + 8) { if (e.pointerType === 'mouse') setHi(null); return; }
    setHi(nearestIndex(xs, px));
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); setHi(i => Math.min(n - 1, (i ?? -1) + 1)); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setHi(i => Math.max(0, (i ?? n) - 1)); }
    else if (e.key === 'Escape') setHi(null);
  };

  const rootStyle: CSSProperties = { height: height === '100%' ? '100%' : height };
  const legend = multi && type !== 'table' && (
    <ul className="vd-ts-legend" aria-hidden="true">
      {series.map((s, si) => (
        <li key={s.id} className={hiSeries !== null && hiSeries !== si ? 'is-dim' : ''}
          onPointerEnter={() => setHiSeries(si)} onPointerLeave={() => setHiSeries(null)}>
          <i className={type === 'line' ? 'is-line' : 'is-box'} style={{ '--c': s.color } as CSSProperties} />{s.label}
        </li>
      ))}
    </ul>
  );

  const table = type === 'table' && (
    <div className="vd-ts-table" tabIndex={0} role="region" aria-label={ariaLabel}>
      <table>
        <caption className="vd-viz-sr">{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">期间</th>
            {series.map(s => <th key={s.id} scope="col" className="is-num"><i style={{ background: s.color }} aria-hidden="true" />{s.label}</th>)}
            {multi && <th scope="col" className="is-num">合计</th>}
          </tr>
        </thead>
        <tbody>
          {labels.map((l, i) => {
            const note = notes.find(x => x.index === i);
            return (
              <tr key={l + i}>
                <th scope="row">{l}{note && <em title={note.text}>{notes.indexOf(note) + 1}</em>}</th>
                {series.map(s => <td key={s.id} className="is-num">{valueFormat(s.values[i] ?? 0)}</td>)}
                {multi && <td className="is-num is-total">{valueFormat(totals[i])}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const tipAt = (() => {
    if (hi === null || !plot.current || type === 'table') return null;
    const r = plot.current.getBoundingClientRect();
    const ty = type === 'bar' ? Math.max(m.t + 12, y(Math.max(...series.map(s => s.values[hi] ?? 0)))) : m.t + ih * 0.42;
    return { x: r.left + xs[hi] + (type === 'bar' ? groupW / 2 : 0), y: r.top + ty };
  })();

  return (
    <div className={`vd-viz vd-ts is-${type}`} ref={root} style={rootStyle}>
      {legend}
      <div className="vd-ts-plot" ref={plot}>
        {table}
        {type !== 'table' && width > 0 && ph > 0 && n > 0 && (
          <svg width={width} height={ph} role="img" aria-label={ariaLabel} tabIndex={0}
            onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={e => { if (e.pointerType === 'mouse') setHi(null); }}
            onKeyDown={onKey} onBlur={() => setHi(null)}>
            <defs>
              {series.map(s => (
                <linearGradient key={s.id} id={`${uid}-g-${s.id}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" style={{ stopColor: s.color, stopOpacity: stacked ? 0.32 : 0.2 }} />
                  <stop offset="1" style={{ stopColor: s.color, stopOpacity: stacked ? 0.1 : 0 }} />
                </linearGradient>
              ))}
            </defs>

            {/* 网格与刻度 */}
            <g className="vd-ts-grid" aria-hidden="true">
              {unit && <text x={m.l - 8} y={m.t - 16} dy="0.32em" textAnchor="end" className="vd-ts-unit">{unit}</text>}
              {tickVals.map(t => (
                <g key={t}>
                  <line x1={m.l} x2={width - m.r + (endLabels ? 4 : 0)} y1={Math.round(y(t)) + 0.5} y2={Math.round(y(t)) + 0.5} className={t === 0 ? 'is-base' : ''} />
                  <text x={m.l - 8} y={y(t)} dy="0.32em" textAnchor="end">{valueFormat(t)}</text>
                </g>
              ))}
              {labels.map((l, i) => showLabel(i) && (
                <text key={l + i} x={xs[i]} y={ph - 6} textAnchor={type !== 'bar' && i === 0 ? 'start' : type !== 'bar' && i === n - 1 ? 'end' : 'middle'} className={hi === i ? 'is-on' : ''}>{l}</text>
              ))}
            </g>

            {/* 注释 */}
            {notes.map((note, k) => note.index >= 0 && note.index < n && (
              <g key={k} className="vd-ts-note" data-fade>
                <line x1={xs[note.index]} x2={xs[note.index]} y1={m.t - 8} y2={base} />
                <circle cx={xs[note.index]} cy={m.t - 16} r={7.5} />
                <text x={xs[note.index]} y={m.t - 16} dy="0.34em" textAnchor="middle" className="vd-ts-note-n">{k + 1}</text>
                {iw > 260 && (
                  <text x={xs[note.index] + (xs[note.index] > m.l + iw * 0.72 ? -13 : 13)} y={m.t - 16} dy="0.34em"
                    textAnchor={xs[note.index] > m.l + iw * 0.72 ? 'end' : 'start'} className="vd-ts-note-t">{note.text}</text>
                )}
              </g>
            ))}

            {/* 数据 */}
            {type === 'bar' ? (
              <g className="vd-ts-bars">
                {labels.map((_, i) => (
                  <g key={i} className={hi !== null && hi !== i ? 'is-dim' : ''}>
                    {series.map((s, si) => {
                      const v = s.values[i] ?? 0;
                      const bx = xs[i] - groupW / 2 + si * (bw + gap);
                      const top = Math.min(y(v), base), hgt = Math.abs(base - y(v));
                      const d = v >= 0 ? barPath(bx, top, bw, hgt, 4) : barPath(bx, top, bw, hgt, 0);
                      return <path key={s.id} d={d} data-grow="y" className={`vd-ts-bar${hiSeries !== null && hiSeries !== si ? ' is-faint' : ''}`}
                        style={{ fill: s.color, d: `path("${d}")` } as CSSProperties}
                        onPointerEnter={() => setHiSeries(si)} onPointerLeave={() => setHiSeries(null)} />;
                    })}
                  </g>
                ))}
              </g>
            ) : (
              <g className="vd-ts-lines">
                <g data-sweep>
                  {series.map((s, si) => {
                    const upper: Pt[] = s.values.map((v, i) => [xs[i], y(stacks ? stacks[si].upper[i] : v ?? 0)]);
                    if (type === 'area' || !multi) {
                      if (stacks) {
                        const lower: Pt[] = stacks[si].lower.map((v, i) => [xs[i], y(v)]);
                        const top = smoothPath(upper), bottom = smoothPath([...lower].reverse()).replace(/^M/, 'L');
                        const d = `${top}${bottom}Z`;
                        return <path key={s.id} d={d} className={`vd-ts-area${hiSeries !== null && hiSeries !== si ? ' is-faint' : ''}`} style={{ fill: `url(#${uid}-g-${s.id})`, d: `path("${d}")` } as CSSProperties} />;
                      }
                      const d = areaPath(upper, base);
                      return <path key={s.id} d={d} className={`vd-ts-area${type === 'line' ? ' is-wash' : ''}`} style={{ fill: `url(#${uid}-g-${s.id})`, d: `path("${d}")` } as CSSProperties} />;
                    }
                    return null;
                  })}
                </g>
                {series.map((s, si) => {
                  const pts: Pt[] = s.values.map((v, i) => [xs[i], y(stacks ? stacks[si].upper[i] : v ?? 0)]);
                  const d = smoothPath(pts);
                  return <path key={s.id} d={d} pathLength={1} strokeDasharray="1" data-draw
                    className={`vd-ts-line${hiSeries !== null && hiSeries !== si ? ' is-faint' : ''}`} style={{ stroke: s.color, d: `path("${d}")` } as CSSProperties} />;
                })}
              </g>
            )}

            {/* 直接标数：单系列标峰值，多系列在末端标名称和数值 */}
            {peak !== null && type !== 'bar' && (
              <g className="vd-ts-peak" data-fade aria-hidden="true">
                <circle cx={xs[peak]} cy={y(series[0].values[peak] ?? 0)} r={3.5} style={{ fill: series[0].color }} />
                <text x={xs[peak]} y={y(series[0].values[peak] ?? 0) - 10} textAnchor={peak === 0 ? 'start' : peak === n - 1 ? 'end' : 'middle'}>{valueFormat(series[0].values[peak] ?? 0)}</text>
              </g>
            )}
            {peak !== null && type === 'bar' && (
              <text className="vd-ts-direct" data-fade x={xs[peak]} y={y(series[0].values[peak] ?? 0) - 8} textAnchor="middle" aria-hidden="true">{valueFormat(series[0].values[peak] ?? 0)}</text>
            )}
            {ends.map(({ s, y: ey }) => {
              const si = series.indexOf(s);
              const vy = y(stacks ? stacks[si].upper[n - 1] : s.values[n - 1] ?? 0);
              return (
                <g key={s.id} className={`vd-ts-end${hiSeries !== null && hiSeries !== si ? ' is-faint' : ''}`} data-fade aria-hidden="true">
                  <circle cx={xs[n - 1]} cy={vy} r={3.5} style={{ fill: s.color }} />
                  {multi && <text x={xs[n - 1] + 12} y={ey - 3} className="vd-ts-end-k">{s.label}</text>}
                  <text x={xs[n - 1] + 12} y={multi ? ey + 11 : ey + 4} className="vd-ts-end-v">{valueFormat(s.values[n - 1] ?? 0)}</text>
                </g>
              );
            })}

            {/* 十字线 */}
            {hi !== null && (
              <g className="vd-ts-cross" aria-hidden="true">
                {type === 'bar'
                  ? <rect x={xs[hi] - Math.min(step, groupW + 14) / 2} y={m.t} width={Math.min(step, groupW + 14)} height={ih} rx={4} className="vd-ts-band" />
                  : <line x1={xs[hi]} x2={xs[hi]} y1={m.t} y2={base} />}
                {type !== 'bar' && series.map((s, si) => (
                  <circle key={s.id} cx={xs[hi]} cy={y(stacks ? stacks[si].upper[hi] : s.values[hi] ?? 0)} r={4.5} style={{ stroke: s.color }} />
                ))}
              </g>
            )}
          </svg>
        )}
      </div>
      {hi !== null && tipAt && (
        <Tip x={tipAt.x} y={tipAt.y} placement={type === 'bar' ? 'above' : 'side'}>
          <TipHead>{labels[hi]}{notes.some(x => x.index === hi) && <span className="vd-tip-note"> · {notes.find(x => x.index === hi)!.text}</span>}</TipHead>
          {[...series].map((s, si) => <Fragment key={s.id}><TipRow color={s.color} kind={type === 'line' ? 'line' : 'solid'} label={s.label} value={valueFormat(s.values[hi] ?? 0)} on={hiSeries === si} /></Fragment>)}
          {multi && <TipRow label="合计" value={valueFormat(totals[hi])} total />}
        </Tip>
      )}
    </div>
  );
}
