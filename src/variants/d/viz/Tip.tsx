import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './viz.css';

/**
 * 图表提示框：浮层表面 + 1px 描边 + 阴影；标题用等宽小字，每行「色块 + 名称 + 数值」。
 * - x / y 是视口坐标（clientX / clientY 口径）。挂到 body 上，用 position: fixed，不会被面板的 overflow 裁掉；
 * - 默认放在锚点右侧，放不下就翻到左侧；上下夹在视口内（底部给方案切换条留 72px）；
 * - placement="above" 时放在锚点上方居中（适合柱子、卫星）。
 */
export function Tip({ x, y, children, placement = 'side', className = '' }: { x: number; y: number; children: ReactNode; placement?: 'side' | 'above'; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight, gap = 14, pad = 8;
    const vw = window.innerWidth, vh = window.innerHeight;
    let l: number, t: number;
    if (placement === 'above') {
      l = x - w / 2;
      t = y - h - gap;
      if (t < pad) t = y + gap;
    } else {
      l = x + gap;
      if (l + w > vw - pad) l = x - gap - w;
      t = y - h / 2;
    }
    l = Math.min(Math.max(pad, l), vw - w - pad);
    t = Math.min(Math.max(pad, t), Math.max(pad, vh - 72 - h));
    el.style.transform = `translate3d(${Math.round(l)}px, ${Math.round(t)}px, 0)`;
  });
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div ref={ref} className={`vd-tip ${className}`} role="status" aria-live="polite">{children}</div>,
    document.body,
  );
}

/** 提示框标题（等宽小字） */
export function TipHead({ children }: { children: ReactNode }) {
  return <p className="vd-tip-h">{children}</p>;
}

/** 提示框一行：色块 + 名称 + 数值；kind="hatch" 时色块画成斜纹（用于「待付款」等） */
export function TipRow({ color, label, value, on = false, total = false, kind = 'solid' }: { color?: string; label: ReactNode; value: ReactNode; on?: boolean; total?: boolean; kind?: 'solid' | 'line' | 'hatch' }) {
  return (
    <p className={`vd-tip-row${on ? ' is-on' : ''}${total ? ' is-total' : ''}`}>
      {color ? <i className={`vd-tip-sw is-${kind}`} style={{ '--c': color } as CSSProperties} aria-hidden="true" /> : <i className="vd-tip-sw is-empty" aria-hidden="true" />}
      <span>{label}</span>
      <b>{value}</b>
    </p>
  );
}
