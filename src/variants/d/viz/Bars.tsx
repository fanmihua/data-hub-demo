import { useRef, useState, type CSSProperties } from 'react';
import { useSite } from '../../../core/provider';
import { niceMax } from '../../../core/charts/scale';
import { pct } from '../../../core/data/format';
import { Tip, TipHead, TipRow } from './Tip';
import { playIn, signature, useEntrance } from './util';
import './viz.css';

/**
 * 一根条：value 画实色条，display 是它的显示文字；
 * secondary（可选）是参照量，画成同色浅底条 + 一道刻线（例如合同额、目标），提示框里给出 value / secondary 的占比。
 */
export interface BarItem { key: string; label: string; value: number; secondary?: number; color: string; display: string }

/**
 * 条形图（HTML 绘制，跟随容器）：
 * - orientation="h"（默认）：横向条，左标签、右数值，适合分系统、合同、部门排行；
 * - orientation="v"：竖向柱，柱宽 ≤ 24px，数据端 4px 圆角、基线端直角；
 * - 单根悬停 / 聚焦高亮，其余变淡，提示框跟随；首次进入视口时生长。
 */
export function Bars({ items, ariaLabel, orientation = 'h' }: { items: BarItem[]; ariaLabel: string; orientation?: 'h' | 'v' }) {
  const { fx } = useSite();
  const root = useRef<HTMLDivElement>(null);
  const [hi, setHi] = useState<string | null>(null);
  const [tipPos, setTipPos] = useState<{ x: number; y: number } | null>(null);
  const max = niceMax(Math.max(1e-9, ...items.flatMap(i => [i.value, i.secondary ?? 0])), 4);
  const share = (v: number) => `${Math.max(0, Math.min(1, v / max)) * 100}%`;
  useEntrance(root, el => playIn(el, { duration: 820 }), { enabled: fx.motion, key: signature([orientation, ...items.map(i => i.key)]) });

  const show = (key: string, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setHi(key);
    setTipPos(orientation === 'h' ? { x: r.left + r.width * 0.62, y: r.top + r.height / 2 } : { x: r.left + r.width / 2, y: r.top + 6 });
  };
  const hide = () => { setHi(null); setTipPos(null); };
  const item = items.find(i => i.key === hi) ?? null;

  if (!items.length) return <div className="vd-viz vd-bars is-empty" ref={root} role="note">暂无数据</div>;

  return (
    <div ref={root} className={`vd-viz vd-bars is-${orientation}`} role="list" aria-label={ariaLabel}
      onPointerLeave={e => { if (e.pointerType === 'mouse') hide(); }}>
      {items.map(it => (
        <div key={it.key} role="listitem" tabIndex={0}
          className={`vd-bar-row${hi && hi !== it.key ? ' is-dim' : ''}${hi === it.key ? ' is-on' : ''}`}
          aria-label={`${it.label}：${it.display}${it.secondary ? `，占 ${pct(it.value / it.secondary)}` : ''}`}
          style={{ '--c': it.color } as CSSProperties}
          onPointerEnter={e => show(it.key, e.currentTarget)} onPointerDown={e => show(it.key, e.currentTarget)}
          onFocus={e => show(it.key, e.currentTarget)} onBlur={hide}>
          <span className="vd-bar-label" title={it.label}>{it.label}</span>
          <span className="vd-bar-track">
            {it.secondary !== undefined && it.secondary > 0 && <span className="vd-bar-ref" data-grow={orientation === 'h' ? 'x' : 'y'} style={orientation === 'h' ? { width: share(it.secondary) } : { height: share(it.secondary) }} />}
            <span className="vd-bar-fill" data-grow={orientation === 'h' ? 'x' : 'y'} style={orientation === 'h' ? { width: share(it.value) } : { height: share(it.value) }} />
            {it.secondary !== undefined && it.secondary > 0 && <span className="vd-bar-tick" style={orientation === 'h' ? { left: share(it.secondary) } : { bottom: share(it.secondary) }} aria-hidden="true" />}
          </span>
          <span className="vd-bar-value">{it.display}</span>
        </div>
      ))}
      {item && tipPos && (
        <Tip x={tipPos.x} y={tipPos.y} placement={orientation === 'v' ? 'above' : 'side'}>
          <TipHead>{item.label}</TipHead>
          <TipRow color={item.color} label="数值" value={item.display} />
          {item.secondary !== undefined && item.secondary > 0 && <TipRow label="占参照" value={pct(item.value / item.secondary)} />}
        </Tip>
      )}
    </div>
  );
}
