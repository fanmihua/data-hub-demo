import { useRef, useState } from 'react';

import { layoutSankey } from '../../../core/charts/sankey';
import type { FlowLink, FlowNode } from '../../../core/data/derive';
import { pct, wanLabel } from '../../../core/data/format';
import { useSite } from '../../../core/provider';
import { useReveal, useSize } from '../lib';
import { Tip, TipRow } from './kit';

/**
 * 资金流向（桑基）+ 流光：
 * - 连线底色是半透明色带，首次进入视口按列逐段描出（等轴测连线逐段绘制的思路）；
 * - 之后每条连线中线上有一串细光点沿资金方向流动（stroke-dashoffset 动画）；
 * - 悬停连线 / 节点单独高亮并给出数值。fx 关闭时不渲染流光层。
 */
export function FlowGraph({ nodes, links, height = 300, ariaLabel, nodeColor, linkColor, columnTitles }: {
  nodes: FlowNode[];
  links: FlowLink[];
  height?: number;
  ariaLabel: string;
  nodeColor: (n: FlowNode) => string;
  /** 连线颜色（按源或目标节点决定） */
  linkColor: (source: FlowNode, target: FlowNode) => string;
  columnTitles?: string[];
}) {
  const { fx } = useSite();
  const box = useRef<HTMLDivElement>(null);
  const { width } = useSize(box);
  const [svgRef, played] = useReveal<SVGSVGElement>(0.3);
  const [hover, setHover] = useState<{ kind: 'link' | 'node'; key: string; x: number; y: number } | null>(null);

  const W = Math.max(width, 200);
  const top = columnTitles ? 26 : 6;
  const H = height;
  const layout = layoutSankey(nodes, links, { width: W, height: H - top - 6, nodeWidth: 8, gap: W < 480 ? 10 : 14 });
  const byId = new Map(layout.nodes.map(n => [n.id, n]));
  const columns = Math.max(1, ...layout.nodes.map(n => n.column + 1));
  const total = (col: number) => layout.nodes.filter(n => n.column === col).reduce((s, n) => s + n.value, 0);

  const hoverLink = hover?.kind === 'link' ? layout.links.find(l => `${l.source}|${l.target}` === hover.key) : null;
  const hoverNode = hover?.kind === 'node' ? byId.get(hover.key) : null;
  const related = (l: { source: string; target: string }) => {
    if (!hover) return true;
    if (hover.kind === 'link') return `${l.source}|${l.target}` === hover.key;
    return l.source === hover.key || l.target === hover.key;
  };
  const where = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <div ref={box} className="va-chart va-flow" style={{ height: H }} onPointerLeave={() => setHover(null)}>
      {width > 0 && (
        <svg ref={svgRef} width={W} height={H} role="img" aria-label={ariaLabel} className={`va-svg${played ? ' is-played' : ''}`}>
          {columnTitles && (
            <g aria-hidden="true">
              {columnTitles.map((t, c) => {
                const x = c === 0 ? 0 : c === columns - 1 ? W : (c * (W - 8)) / (columns - 1) + 4;
                return <text key={t} x={x} y={12} textAnchor={c === 0 ? 'start' : c === columns - 1 ? 'end' : 'middle'} className="va-mono-svg">{t}</text>;
              })}
            </g>
          )}
          <g transform={`translate(0 ${top})`}>
            <g className="va-flow-links">
              {layout.links.map(l => {
                const s = byId.get(l.source)!, t = byId.get(l.target)!;
                const col = linkColor(s, t);
                const key = `${l.source}|${l.target}`;
                const on = related(l);
                return (
                  <g key={key} className={`va-flow-link${hover ? (on ? ' is-on' : ' is-dim') : ''}`}>
                    <path d={l.path} strokeWidth={Math.max(1.5, l.width)} className="va-flow-band"
                      style={{ stroke: col, transitionDelay: `${s.column * 380 + 120}ms` }}
                      onPointerMove={e => setHover({ kind: 'link', key, ...where(e) })}
                      onPointerDown={e => setHover({ kind: 'link', key, ...where(e) })} />
                    <path d={l.path} className="va-flow-trace va-draw" pathLength={1} aria-hidden="true"
                      style={{ stroke: col, transitionDelay: `${s.column * 380}ms` }} />
                    {fx.motion && played && (
                      <path d={l.path} className="va-flow-light" aria-hidden="true"
                        style={{ stroke: col, animationDelay: `${-((s.column * 0.7 + l.sy * 0.013) % 2.6)}s`, strokeWidth: Math.min(2.2, Math.max(1.2, l.width * 0.18)) }} />
                    )}
                  </g>
                );
              })}
            </g>
            {layout.nodes.map(n => {
              const lastCol = n.column === columns - 1;
              const firstCol = n.column === 0;
              const share = total(n.column) ? n.value / total(n.column) : 0;
              const lx = lastCol ? n.x - 8 : n.x + n.w + 8;
              const anchor = lastCol ? 'end' : 'start';
              const narrow = W < 520;
              const tall = n.h >= 30 && (!narrow || firstCol);
              return (
                <g key={n.id} className={`va-flow-node${hover && hover.kind === 'node' && hover.key !== n.id ? ' is-dim' : ''}`}
                  onPointerMove={e => setHover({ kind: 'node', key: n.id, ...where(e) })}
                  onPointerDown={e => setHover({ kind: 'node', key: n.id, ...where(e) })}>
                  <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={2} style={{ fill: nodeColor(n) }} />
                  <rect x={n.x - 6} y={n.y - 4} width={n.w + 12} height={n.h + 8} fill="transparent" />
                  {(n.h >= 30 || firstCol || lastCol) && (
                    <text x={lx} y={n.y + n.h / 2} textAnchor={anchor} className="va-flow-label" dy={tall ? '-0.3em' : '0.34em'}>
                      {n.label}
                    </text>
                  )}
                  {tall && (
                    <text x={lx} y={n.y + n.h / 2} textAnchor={anchor} className="va-flow-value" dy="1.05em">
                      {wanLabel(n.value)} · {pct(share)}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      )}
      {hover && (hoverLink || hoverNode) && (
        <Tip x={hover.x} y={hover.y} width={W} height={H}>
          {hoverLink && (
            <>
              <p className="va-tip-title">{byId.get(hoverLink.source)!.label} → {byId.get(hoverLink.target)!.label}</p>
              <TipRow color={linkColor(byId.get(hoverLink.source)!, byId.get(hoverLink.target)!)} label="金额" value={wanLabel(hoverLink.value)} />
              {(() => {
                const src = byId.get(hoverLink.source)!, tgt = byId.get(hoverLink.target)!;
                const ss = hoverLink.value / (src.value || 1), ts = hoverLink.value / (tgt.value || 1);
                const useSrc = ss < 0.999 || ts >= 0.999;
                return <TipRow label={`占「${useSrc ? src.label : tgt.label}」`} value={pct(useSrc ? ss : ts)} />;
              })()}
            </>
          )}
          {hoverNode && (
            <>
              <p className="va-tip-title">{hoverNode.label}</p>
              <TipRow color={nodeColor(hoverNode)} label="金额" value={wanLabel(hoverNode.value)} />
              <TipRow label="占本列" value={pct(hoverNode.value / (total(hoverNode.column) || 1))} />
            </>
          )}
        </Tip>
      )}
    </div>
  );
}
