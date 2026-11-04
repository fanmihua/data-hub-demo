import type { WidgetConfig } from '../../model/types';

/**
 * 组件缩略图（组件库、配置面板、拖拽影子里用）：40×28 的线稿，主色点缀。
 * 只表达「这是什么组件」，不画数据，所以 aria-hidden。
 */
export function Glyph({ w }: { w: Pick<WidgetConfig, 'kind' | 'chartType'> }) {
  const t = w.kind === 'timeseries' ? w.chartType ?? 'line' : w.kind;
  return (
    <svg className="vd-glyph" width="40" height="28" viewBox="0 0 40 28" aria-hidden="true" focusable="false">
      {t === 'kpi' && <>
        <rect x="4" y="5" width="12" height="2" rx="1" className="is-soft" />
        <rect x="4" y="11" width="22" height="7" rx="1.5" className="is-ink" />
        <rect x="4" y="22" width="32" height="2" rx="1" className="is-soft" />
        <rect x="4" y="22" width="22" height="2" rx="1" className="is-acc" />
      </>}
      {t === 'stream' && <>
        <rect x="4" y="5" width="10" height="2" rx="1" className="is-soft" />
        <rect x="4" y="12" width="13" height="6" rx="1.5" className="is-ink" />
        <path d="M21 20l4-5 4 2 4-7 3 3" className="is-line" />
      </>}
      {(t === 'line' || t === 'area') && <>
        <path d="M4 23h32" className="is-axis" />
        {t === 'area' && <path d="M4 20l7-6 7 3 8-9 10 4v11H4z" className="is-fill" />}
        <path d="M4 20l7-6 7 3 8-9 10 4" className="is-line" />
        <circle cx="26" cy="8" r="2" className="is-acc" />
      </>}
      {t === 'bar' && <>
        <path d="M4 24h32" className="is-axis" />
        {[[7, 14], [13, 9], [19, 16], [25, 6], [31, 12]].map(([x, y]) => <rect key={x} x={x} y={y} width="4" height={24 - y} rx="1" className={x === 25 ? 'is-acc' : 'is-ink-soft'} />)}
      </>}
      {t === 'table' && <>
        <rect x="4" y="4" width="32" height="20" rx="2" className="is-frame" />
        <path d="M4 10h32M4 16h32M16 4v20" className="is-axis" />
        <rect x="19" y="12" width="12" height="2" rx="1" className="is-acc" />
      </>}
      {t === 'bars' && <>
        {[[6, 26], [11, 18], [16, 22], [21, 12]].map(([y, w2]) => <rect key={y} x="4" y={y} width={w2} height="3" rx="1" className={y === 6 ? 'is-acc' : 'is-ink-soft'} />)}
      </>}
      {t === 'sankey' && <>
        <rect x="4" y="5" width="3" height="18" rx="1" className="is-ink" />
        <rect x="33" y="4" width="3" height="9" rx="1" className="is-acc" />
        <rect x="33" y="16" width="3" height="8" rx="1" className="is-ink-soft" />
        <path d="M7 9c13 0 13-1 26-1M7 18c13 0 13 2 26 2" className="is-band" />
      </>}
      {t === 'globe' && <>
        <circle cx="20" cy="14" r="8" className="is-frame" />
        <ellipse cx="20" cy="14" rx="15" ry="5" transform="rotate(-18 20 14)" className="is-orbit" />
        <circle cx="33" cy="9.5" r="2" className="is-acc" />
        {[[17, 11], [21, 12], [19, 16], [23, 16]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r=".9" className="is-ink" />)}
      </>}
      {t === 'ring' && <>
        <circle cx="14" cy="14" r="8" className="is-track" />
        <path d="M14 6a8 8 0 0 1 7.6 10.5" className="is-arc" />
        <rect x="26" y="9" width="10" height="2" rx="1" className="is-ink-soft" />
        <rect x="26" y="15" width="7" height="2" rx="1" className="is-soft" />
      </>}
      {t === 'contracts' && <>
        {[6, 13, 20].map((y, i) => <g key={y}><rect x="4" y={y} width="32" height="3" rx="1" className="is-soft" /><rect x="4" y={y} width={[24, 15, 28][i]} height="3" rx="1" className="is-acc-soft" /><rect x="4" y={y} width={[16, 9, 12][i]} height="3" rx="1" className="is-acc" /></g>)}
      </>}
      {t === 'timeline' && <>
        <path d="M4 10h32M4 19h32" className="is-axis" />
        <path d="M8 10h9M22 19h10" className="is-line" />
        <circle cx="8" cy="10" r="2.6" className="is-acc" />
        <circle cx="26" cy="10" r="2" className="is-frame" />
        <circle cx="22" cy="19" r="3" className="is-acc" />
        <circle cx="12" cy="19" r="2" className="is-ink-soft" />
      </>}
    </svg>
  );
}
