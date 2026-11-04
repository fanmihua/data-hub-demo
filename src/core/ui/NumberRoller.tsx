import { useEffect, useRef, useState } from 'react';
import { useSite } from '../provider';
import { useInView } from '../fx/hooks';
import './number-roller.css';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * 数字滚轮：每一位是 0–9 的竖排栈，用 transform 滚到目标位。
 * - 首次进入视口时从 0 滚到目标值；之后数值变化时直接滚到新值。
 * - 关闭特效或系统要求减少动态时，直接显示终值。
 * - 读屏只读整体数值（aria-label），滚动列 aria-hidden。
 * 样式：外层 .nr，字体、字号、颜色由使用方决定；必须是等宽数字（tabular-nums 已默认开启）。
 */
export function NumberRoller({ value, format = (n: number) => String(n), duration = 1000, stagger = 45, className = '', label }: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  /** 相邻两位之间的延迟（毫秒） */
  stagger?: number;
  className?: string;
  /** 读屏文本，默认等于格式化后的数值 */
  label?: string;
}) {
  const { fx } = useSite();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { threshold: 0.4 });
  const text = format(value);
  const zero = text.replace(/\d/g, '0');
  const [shown, setShown] = useState(fx.motion ? zero : text);
  useEffect(() => {
    if (!fx.motion) { setShown(text); return; }
    if (!inView) return;
    const id = requestAnimationFrame(() => setShown(text));
    return () => cancelAnimationFrame(id);
  }, [text, inView, fx.motion]);

  const chars = shown.split('');
  return (
    <span ref={ref} className={`nr ${className}`} role="img" aria-label={label ?? text}>
      {chars.map((ch, i) => {
        const fromRight = chars.length - i;
        if (!/\d/.test(ch)) return <span key={`s${fromRight}`} className="nr-sym" aria-hidden="true">{ch}</span>;
        const d = Number(ch);
        return (
          <span key={`d${fromRight}`} className="nr-col" aria-hidden="true">
            <span className="nr-stack" style={{ transform: `translateY(${-d * 10}%)`, transitionDuration: fx.motion ? `${duration}ms` : '0ms', transitionDelay: fx.motion ? `${(chars.length - fromRight) * stagger}ms` : '0ms' }}>
              {DIGITS.map(n => <span key={n}>{n}</span>)}
            </span>
          </span>
        );
      })}
    </span>
  );
}
