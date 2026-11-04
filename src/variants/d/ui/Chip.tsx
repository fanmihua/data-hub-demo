import type { ReactNode } from 'react';

/**
 * 标签按钮：筛选（型号、类型、部门）、建议问题都用它。
 * active 时为主色描边 + 主色淡底 + 前置小圆点；没有 onClick 时渲染成静态标签。
 */
export function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  if (!onClick) return <span className={`vd-chip is-static${active ? ' is-active' : ''}`}>{children}</span>;
  return (
    <button type="button" className={`vd-chip${active ? ' is-active' : ''}`} aria-pressed={active === undefined ? undefined : active} onClick={onClick}>
      {children}
    </button>
  );
}
