import type { CSSProperties } from 'react';
import { IconBill, IconBoard, IconContract, IconMetric, IconOrbit, IconPayment } from '../../ui/icons';
import type { LineageIcon, LineageNode } from './lib';

/**
 * 小血缘图：节点横排成一条管线，连线上有一道流光沿数据方向依次跑过（A 版流光连线的做法）。
 * - 本资产是实心主色圆；依赖的节点是主色描边；不相关的节点灰显、虚线；
 * - 流光只用 transform 动画；关闭特效时不渲染流光，只留连线和箭头。
 */
const ICON: Record<LineageIcon, typeof IconBill> = {
  contract: IconContract, bill: IconBill, payment: IconPayment, model: IconOrbit, metric: IconMetric, board: IconBoard,
};

export function Lineage({ nodes, motion }: { nodes: LineageNode[]; motion: boolean }) {
  if (!nodes.length) return null;
  const summary = nodes.map(n => `${n.label}${n.self ? '（本资产）' : ''}`).join(' → ');
  return (
    <figure className="vd-as-lin" aria-label={`数据血缘：${summary}`} role="img" style={{ '--n': nodes.length } as CSSProperties}>
      <ol className="vd-as-lin-row" aria-hidden="true">
        {nodes.map((n, i) => {
          const Ic = ICON[n.icon];
          const next = nodes[i + 1];
          const edgeOn = next && n.on && next.on;
          return (
            <li key={n.id} className={`vd-as-lin-node${n.self ? ' is-self' : ''}${n.on ? ' is-on' : ' is-off'}`}>
              <span className="vd-as-lin-disc"><Ic /></span>
              <span className="vd-as-lin-name" title={n.label}>{n.label}</span>
              <span className="vd-as-lin-meta">{n.self ? '本资产' : n.meta}</span>
              <span className="vd-as-lin-amt">{n.amount}</span>
              {next && (
                <i className={`vd-as-lin-edge${edgeOn ? ' is-on' : ''}`} style={{ '--i': i } as CSSProperties}>
                  {motion && edgeOn && <b className="vd-as-lin-flow" />}
                </i>
              )}
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
