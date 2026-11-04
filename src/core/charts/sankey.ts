import type { FlowLink, FlowNode } from '../data/derive';

export interface SankeyNodeLayout extends FlowNode {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SankeyLinkLayout extends FlowLink {
  /** 连线中心路径（三次贝塞尔），stroke-width 用 width */
  path: string;
  width: number;
  sy: number;
  ty: number;
}

/**
 * 简单的多列桑基布局（列数由 node.column 决定）。
 * 每列节点按数值降序竖排，节点高度与数值成正比，列内留 gap。
 */
export function layoutSankey(nodes: FlowNode[], links: FlowLink[], { width, height, nodeWidth = 10, gap = 14, padX = 0 }: { width: number; height: number; nodeWidth?: number; gap?: number; padX?: number }) {
  const columns = Math.max(1, ...nodes.map(n => n.column + 1));
  const byCol: FlowNode[][] = Array.from({ length: columns }, () => []);
  nodes.forEach(n => byCol[n.column].push(n));
  byCol.forEach(col => col.sort((a, b) => b.value - a.value));
  const k = Math.min(...byCol.map(col => {
    const total = col.reduce((s, n) => s + n.value, 0);
    return total ? (height - gap * Math.max(0, col.length - 1)) / total : Infinity;
  }));
  const colX = (c: number) => padX + (columns === 1 ? 0 : (c * (width - padX * 2 - nodeWidth)) / (columns - 1));
  const out: SankeyNodeLayout[] = [];
  byCol.forEach((col, c) => {
    const used = col.reduce((s, n) => s + n.value * k, 0) + gap * Math.max(0, col.length - 1);
    let y = (height - used) / 2;
    col.forEach(n => { const h = Math.max(1, n.value * k); out.push({ ...n, x: colX(c), y, w: nodeWidth, h }); y += h + gap; });
  });
  const pos = new Map(out.map(n => [n.id, n]));
  const outOffset = new Map<string, number>(), inOffset = new Map<string, number>();
  const sorted = [...links].sort((a, b) => (pos.get(a.source)!.y - pos.get(b.source)!.y) || (pos.get(a.target)!.y - pos.get(b.target)!.y));
  const linkLayouts: SankeyLinkLayout[] = sorted.map(l => {
    const s = pos.get(l.source)!, t = pos.get(l.target)!;
    const w = Math.max(1, l.value * k);
    const so = outOffset.get(s.id) ?? 0, to = inOffset.get(t.id) ?? 0;
    outOffset.set(s.id, so + w); inOffset.set(t.id, to + w);
    const sy = s.y + so + w / 2, ty = t.y + to + w / 2;
    const x0 = s.x + s.w, x1 = t.x, mx = (x0 + x1) / 2;
    return { ...l, width: w, sy, ty, path: `M${x0},${sy}C${mx},${sy} ${mx},${ty} ${x1},${ty}` };
  });
  return { nodes: out, links: linkLayouts, scale: k };
}
