import { useId, useRef, useState } from 'react';
import { useElementSize, useInView } from '../../../core/fx/hooks';
import { useSite } from '../../../core/provider';
import { layoutSankey } from '../../../core/charts/sankey';
import type { FlowLink, FlowNode } from '../../../core/data/derive';
import { useReveal } from '../lib';
import { Tip, TipRow, useOutsideClear } from './common';

type Hover = { kind: 'node'; id: string } | { kind: 'link'; i: number } | null;

/**
 * 桑基图：连线用「源色 → 目标色」渐变；悬停节点高亮相连的线，悬停连线只亮这一条。
 * flow=true 时连线上有流光（stroke-dashoffset 循环），离开视口暂停。
 */
export function Sankey({ nodes, links, height = 280, nodeColor, fmt, ariaLabel, focus, flow = false, labelWidth = 0 }: {
  nodes: FlowNode[];
  links: FlowLink[];
  height?: number;
  nodeColor: (n: FlowNode) => string;
  fmt: (v: number) => string;
  ariaLabel: string;
  focus?: string | null;
  flow?: boolean;
  /** 左右两侧给标签预留的宽度 */
  labelWidth?: number;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(wrap);
  const drawn = useReveal(wrap);
  const live = useInView(wrap, { once: false, threshold: 0 });
  const { fx } = useSite();
  const [hover, setHover] = useState<Hover>(null);
  useOutsideClear(wrap, hover !== null, () => setHover(null));
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const w = Math.max(200, width), h = height;
  const valid = nodes.length > 0 && links.length > 0;
  const L = valid ? layoutSankey(nodes, links, { width: w - labelWidth * 2, height: h - 8, nodeWidth: 10, gap: 14 }) : null;
  const byId = new Map((L?.nodes ?? []).map(n => [n.id, n]));
  const lastCol = Math.max(0, ...nodes.map(n => n.column));
  const narrow = w < 480;
  const act: Hover = hover ?? (focus ? { kind: 'node', id: focus } : null);
  const linkOn = (i: number) => {
    if (!act || !L) return null;
    const l = L.links[i];
    if (act.kind === 'link') return act.i === i;
    return l.source === act.id || l.target === act.id;
  };
  const tip = (() => {
    if (!hover || !L) return null;
    if (hover.kind === 'node') {
      const n = byId.get(hover.id);
      if (!n) return null;
      return { x: labelWidth + n.x + n.w / 2, y: 4 + n.y - 6, title: n.label, rows: [{ c: nodeColor(n), l: '金额', v: fmt(n.value) }] };
    }
    const l = L.links[hover.i];
    const s = byId.get(l.source)!, t = byId.get(l.target)!;
    return { x: labelWidth + (s.x + s.w + t.x) / 2, y: 4 + (l.sy + l.ty) / 2 - l.width / 2 - 6, title: `${s.label} → ${t.label}`, rows: [{ c: nodeColor(s), l: '金额', v: fmt(l.value) }] };
  })();

  return (
    <div ref={wrap} className={`vb-chart vb-sankey${drawn && fx.motion ? ' is-drawing' : ''}${flow && fx.motion && live ? ' is-live' : ''}`} role="group" tabIndex={0} aria-label={ariaLabel}
      onBlur={() => setHover(null)} onKeyDown={e => {
        if (!L) return;
        const ids = L.nodes.map(n => n.id);
        const cur = hover?.kind === 'node' ? ids.indexOf(hover.id) : -1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); setHover({ kind: 'node', id: ids[(cur + 1) % ids.length] }); }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); setHover({ kind: 'node', id: ids[(cur - 1 + ids.length) % ids.length] }); }
        if (e.key === 'Escape') setHover(null);
      }}>
      {width > 0 && L && (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={ariaLabel} onPointerLeave={e => { if (e.pointerType === 'mouse') setHover(null); }}>
          <defs>
            {L.links.map((l, i) => {
              const s = byId.get(l.source)!, t = byId.get(l.target)!;
              return (
                <linearGradient key={i} id={`sk${uid}${i}`} gradientUnits="userSpaceOnUse" x1={s.x + s.w} x2={t.x} y1={0} y2={0}>
                  <stop offset="0" style={{ stopColor: nodeColor(s) }} />
                  <stop offset="1" style={{ stopColor: nodeColor(t) }} />
                </linearGradient>
              );
            })}
          </defs>
          <g transform={`translate(${labelWidth},4)`}>
            {L.links.map((l, i) => {
              const on = linkOn(i);
              return (
                <g key={i} className={`vb-sk-link${on === true ? ' is-on' : on === false ? ' is-dim' : ''}`} style={{ ['--i' as string]: i }}>
                  <path d={l.path} style={{ stroke: `url(#sk${uid}${i})`, strokeWidth: Math.max(1, l.width) }} pathLength={1} className="vb-sk-path"
                    onPointerEnter={() => setHover({ kind: 'link', i })} onPointerDown={() => setHover({ kind: 'link', i })} />
                  {flow && <path d={l.path} className="vb-sk-flow" style={{ strokeWidth: Math.min(2, Math.max(1, l.width / 3)), animationDelay: `${(i % 5) * -0.7}s` }} />}
                </g>
              );
            })}
            {L.nodes.map(n => {
              const left = n.column < lastCol;
              const on = act?.kind === 'node' && act.id === n.id;
              // 窄屏时中间列的标签会压到右列：去掉「分系统」后缀、不标数（数值在悬停提示里）
              const mid = narrow && n.column > 0 && n.column < lastCol;
              return (
                <g key={n.id} className={`vb-sk-node${on ? ' is-on' : ''}`} onPointerEnter={() => setHover({ kind: 'node', id: n.id })} onPointerDown={() => setHover({ kind: 'node', id: n.id })}>
                  <rect x={n.x} y={n.y} width={n.w} height={Math.max(2, n.h)} rx={2} style={{ fill: nodeColor(n) }} />
                  <text x={left ? n.x + n.w + 8 : n.x - 8} y={n.y + n.h / 2} dy="0.35em" textAnchor={left ? 'start' : 'end'} className="vb-sk-label">
                    {mid ? n.label.replace(/分系统$/, '') : n.label}{!mid && <tspan className="vb-sk-val" dx="6">{fmt(n.value)}</tspan>}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      )}
      {!valid && <p className="vb-empty">当前筛选下没有资金流向数据。</p>}
      {tip && (
        <Tip x={tip.x} y={tip.y} width={w}>
          <div className="vb-tip-title">{tip.title}</div>
          {tip.rows.map(r => <TipRow key={r.l} color={r.c} label={r.l} value={r.v} />)}
        </Tip>
      )}
    </div>
  );
}
