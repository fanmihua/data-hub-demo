import { useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useSite } from '../../../core/provider';
import { layoutSankey } from '../../../core/charts/sankey';
import type { FlowLink, FlowNode } from '../../../core/data/derive';
import { pct, wanLabel } from '../../../core/data/format';
import { Tip, TipHead, TipRow } from './Tip';
import { modelColorVar, playIn, signature, textWidth, useBox, useEntrance } from './util';
import './viz.css';

const UNPAID = 'st:unpaid';

/**
 * 资金流向桑基图（SVG，跟随容器）：
 * - 节点色：型号用型号固定色；分系统、合同用墨色 / 主色；已付款墨色；待付款斜纹（配文字）；
 * - 连线是源色 → 目标色的渐变色带，首次进入视口按列逐段描出；
 * - 流光：每条连线中线上有一段短光沿资金方向流动（fx 关闭时不渲染，减弱时变慢）；
 * - 悬停连线 / 节点单独高亮并给出金额与占比。
 * 数值按「元」处理，显示为万元；需要别的口径时传 valueFormat。
 */
export function Sankey({ nodes, links, ariaLabel, height = 260, valueFormat = wanLabel }: {
  nodes: FlowNode[];
  links: FlowLink[];
  ariaLabel: string;
  height?: number | '100%';
  valueFormat?: (n: number) => string;
}) {
  const { fx, data } = useSite();
  const uid = useId().replace(/:/g, '');
  const root = useRef<HTMLDivElement>(null);
  const { width, height: h } = useBox(root);
  const [hi, setHi] = useState<{ kind: 'node' | 'link'; id: string; x: number; y: number } | null>(null);

  const modelIds = data.models.map(m => m.id);
  const nodeColor = (n: FlowNode) => {
    if (n.kind === 'model') return modelColorVar(modelIds.indexOf(n.label));
    if (n.kind === 'status') return n.id === UNPAID ? 'var(--vd-ink-3, #7A8294)' : 'var(--vd-ink-1, #0E1320)';
    if (n.kind === 'contract') return n.id === 'c:none' ? 'var(--vd-ink-3, #7A8294)' : 'var(--accent)';
    return 'var(--vd-ink-2, #4B5466)';
  };

  const columns = Math.max(1, ...nodes.map(n => n.column + 1));
  const narrow = width < 360;
  // 首列标签放左边、末列标签放右边，各自留出宽度；中间列标签压在连线上（带表面色描边）
  const colLabelW = (c: number) => Math.min(96, Math.max(0, ...nodes.filter(n => n.column === c).map(n => Math.max(textWidth(n.label, 12), textWidth(valueFormat(n.value), 10.5)))) + 10);
  const ml = narrow ? 0 : colLabelW(0);
  const mr = narrow || columns < 2 ? 0 : colLabelW(columns - 1);
  const top = 6, bottom = 6;

  const lay = useMemo(() => (width > 0 && h > 0 && nodes.length
    ? layoutSankey(nodes, links, { width: Math.max(60, width - ml - mr), height: Math.max(40, h - top - bottom), nodeWidth: 8, gap: Math.max(6, Math.min(14, h / 24)) })
    : null), [nodes, links, width, h, ml, mr]);
  const byId = useMemo(() => new Map((lay?.nodes ?? []).map(n => [n.id, n])), [lay]);
  const colTotal = useMemo(() => {
    const t = new Map<number, number>();
    nodes.forEach(n => t.set(n.column, (t.get(n.column) ?? 0) + n.value));
    return t;
  }, [nodes]);

  useEntrance(root, el => playIn(el, { duration: 1000 }), { enabled: fx.motion, ready: !!lay, key: signature(nodes.map(n => n.id)) });

  const linkId = (l: FlowLink) => `${l.source}|${l.target}`;
  const related = (l: FlowLink) => !hi || (hi.kind === 'link' ? linkId(l) === hi.id : l.source === hi.id || l.target === hi.id);
  const nodeRelated = (id: string) => !hi || (hi.kind === 'node' ? hi.id === id : hi.id.split('|').includes(id));
  const at = (e: { clientX: number; clientY: number }) => ({ x: e.clientX, y: e.clientY });

  let tip: ReactNode = null;
  if (hi && lay) {
    if (hi.kind === 'link') {
      const l = lay.links.find(x => linkId(x) === hi.id);
      if (l) {
        const s = byId.get(l.source)!, t = byId.get(l.target)!;
        tip = <><TipHead>{s.label} → {t.label}</TipHead><TipRow color={nodeColor(s)} label="金额" value={valueFormat(l.value)} /><TipRow label={`占「${s.label}」`} value={pct(l.value / (s.value || 1))} /></>;
      }
    } else {
      const n = byId.get(hi.id);
      if (n) tip = <><TipHead>{n.label}</TipHead><TipRow color={nodeColor(n)} kind={n.id === UNPAID ? 'hatch' : 'solid'} label="金额" value={valueFormat(n.value)} /><TipRow label="占本列" value={pct(n.value / (colTotal.get(n.column) || 1))} /></>;
    }
  }

  return (
    <div ref={root} className="vd-viz vd-sankey" style={{ height: height === '100%' ? '100%' : height }}
      onPointerLeave={e => { if (e.pointerType === 'mouse') setHi(null); }}>
      {lay && (
        <svg width={width} height={h} role="img" aria-label={ariaLabel} className={hi ? 'is-hovering' : ''}>
          <defs>
            <pattern id={`${uid}-hatch`} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
              <rect width="6" height="6" className="vd-sk-hatch-bg" />
              <line x1="1.5" y1="0" x2="1.5" y2="6" className="vd-sk-hatch-ln" />
            </pattern>
            {lay.links.map((l, i) => {
              const s = byId.get(l.source)!, t = byId.get(l.target)!;
              return (
                <linearGradient key={i} id={`${uid}-l${i}`} gradientUnits="userSpaceOnUse" x1={s.x + s.w} x2={t.x} y1="0" y2="0">
                  <stop offset="0" style={{ stopColor: nodeColor(s) }} />
                  <stop offset="1" style={{ stopColor: nodeColor(t) }} />
                </linearGradient>
              );
            })}
          </defs>
          <g transform={`translate(${ml},${top})`}>
            {lay.links.map((l, i) => {
              const s = byId.get(l.source)!, t = byId.get(l.target)!;
              const id = linkId(l);
              const unpaid = l.target === UNPAID;
              const on = hi?.kind === 'link' && hi.id === id;
              return (
                <g key={id} className={`vd-sk-link${related(l) ? '' : ' is-dim'}${on ? ' is-on' : ''}`}>
                  <path d={l.path} pathLength={1} strokeDasharray="1" data-draw data-delay={s.column * 260}
                    className="vd-sk-band" style={{ stroke: unpaid ? `url(#${uid}-hatch)` : `url(#${uid}-l${i})`, strokeWidth: Math.max(1, l.width) }}
                    onPointerMove={e => setHi({ kind: 'link', id, ...at(e) })} onPointerDown={e => setHi({ kind: 'link', id, ...at(e) })} />
                  {fx.motion && !unpaid && (
                    <path d={l.path} pathLength={100} className="vd-sk-flow" aria-hidden="true"
                      style={{ stroke: nodeColor(s), strokeWidth: Math.max(1.2, Math.min(2.4, l.width * 0.22)), animationDelay: `${-((s.column * 0.9 + i * 0.37) % 3)}s, 1s` } as CSSProperties} />
                  )}
                </g>
              );
            })}
            {lay.nodes.map(n => {
              const first = n.column === 0, last = n.column === columns - 1 && columns > 1;
              const lx = first && !narrow ? n.x - 8 : last && !narrow ? n.x + n.w + 8 : last ? n.x - 6 : n.x + n.w + 6;
              const anchor = (first && !narrow) || (last && narrow) ? 'end' : 'start';
              const tall = n.h >= 26;
              return (
                <g key={n.id} className={`vd-sk-node${nodeRelated(n.id) ? '' : ' is-dim'}`}
                  onPointerMove={e => setHi({ kind: 'node', id: n.id, ...at(e) })} onPointerDown={e => setHi({ kind: 'node', id: n.id, ...at(e) })}>
                  <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={2} data-grow="y" className="vd-sk-rect"
                    style={{ fill: n.id === UNPAID ? `url(#${uid}-hatch)` : nodeColor(n), stroke: n.id === UNPAID ? 'var(--vd-ink-3, #7A8294)' : 'none' }} />
                  <rect x={n.x - 6} y={n.y - 3} width={n.w + 12} height={n.h + 6} className="vd-sk-hit" />
                  {(tall || first || last || n.h >= 12) && (
                    <text x={lx} y={n.y + n.h / 2} textAnchor={anchor} dy={tall ? '-0.25em' : '0.34em'} className={`vd-sk-label${first || last ? '' : ' is-mid'}`} data-fade>
                      {n.label}
                    </text>
                  )}
                  {tall && (
                    <text x={lx} y={n.y + n.h / 2} textAnchor={anchor} dy="1.05em" className={`vd-sk-val${first || last ? '' : ' is-mid'}`} data-fade>{valueFormat(n.value)}</text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      )}
      {hi && tip && <Tip x={hi.x} y={hi.y}>{tip}</Tip>}
    </div>
  );
}
