import { useId, useMemo } from 'react';
import { smoothPath, type Pt } from '../../../core/charts/scale';

/**
 * 迷你曲线：平滑折线 + 渐隐面积 + 末端圆点。
 * - color 可以是任意 CSS 颜色（含 var(--vd-m2) 这类变量）；
 * - pulse：末端圆点外加一圈呼吸光环（关闭特效时不动）；
 * - 首次出现时描线（600–900ms），关闭特效时直接是终态。
 * 纯装饰：aria-hidden，数值请在旁边用文字给出。
 */
export function Sparkline({ values, color, width, height, pulse }: { values: number[]; color: string; width: number; height: number; pulse?: boolean }) {
  const gid = `vd-sp-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const geo = useMemo(() => {
    const vs = values.length ? values : [0];
    const pad = 3;
    const min = Math.min(...vs), max = Math.max(...vs);
    const span = max - min || 1;
    const flat = max === min;
    const pts: Pt[] = vs.map((v, i) => [
      vs.length === 1 ? width / 2 : pad + (i / (vs.length - 1)) * (width - pad * 2),
      flat ? height / 2 : pad + (1 - (v - min) / span) * (height - pad * 2),
    ]);
    const line = smoothPath(pts);
    const area = `${line}L${pts[pts.length - 1][0].toFixed(2)},${height}L${pts[0][0].toFixed(2)},${height}Z`;
    return { pts, line, area, last: pts[pts.length - 1] };
  }, [values, width, height]);

  return (
    <svg className={`vd-spark${pulse ? ' is-pulse' : ''}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false" style={{ ['--c' as string]: color }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: color, stopOpacity: 0.2 }} />
          <stop offset="1" style={{ stopColor: color, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path className="vd-spark-area" d={geo.area} fill={`url(#${gid})`} />
      <path className="vd-spark-line" d={geo.line} pathLength={1} />
      {pulse && <circle className="vd-spark-ping" cx={geo.last[0]} cy={geo.last[1]} r={3} />}
      <circle className="vd-spark-dot" cx={geo.last[0]} cy={geo.last[1]} r={2.4} />
    </svg>
  );
}
