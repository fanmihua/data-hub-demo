import type { ReactNode } from 'react';

/**
 * 面板：白底 + 1px 描边 + 很淡的分层阴影，四角有 HUD 描角。
 * - kicker：等宽小字（遥测标签），title：面板标题，actions：右上角按钮区；
 * - spot：悬停时出现跟随指针的聚光灯边框（坐标由外壳的 useSpotlight 写入 --mx / --my）。
 * 面板本身是 flex 纵向容器，正文 .vd-panel-body 占满剩余高度、超出时在内部滚动。
 */
export function Panel({ title, kicker, actions, className, children, spot }: {
  title?: ReactNode;
  kicker?: string;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
  spot?: boolean;
}) {
  const head = title != null || kicker || actions;
  return (
    <section className={`vd-panel${spot ? ' is-spot' : ''}${className ? ` ${className}` : ''}`} data-spot={spot ? '' : undefined}>
      <span className="vd-panel-hud" aria-hidden="true"><i /><i /><i /><i /></span>
      {head && (
        <header className="vd-panel-head">
          <div className="vd-panel-titles">
            {kicker && <p className="vd-kicker">{kicker}</p>}
            {title != null && <h2 className="vd-panel-title">{title}</h2>}
          </div>
          {actions && <div className="vd-panel-actions">{actions}</div>}
        </header>
      )}
      <div className="vd-panel-body">{children}</div>
    </section>
  );
}
