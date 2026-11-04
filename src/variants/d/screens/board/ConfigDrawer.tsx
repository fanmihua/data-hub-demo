import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react';
import { compatibleTypes } from '../../model/editor';
import { METRICS, METRIC_KEYS } from '../../model/metrics';
import type { BoardLayout, ChartType, MetricKey, WidgetColor, WidgetConfig, WidgetKind } from '../../model/types';
import { IconClose, IconLayers, IconTrash } from '../../ui/icons';
import { Glyph } from './glyphs';
import { IconArea, IconColumn, IconLine, IconSlot, IconTableView } from './icons';
import { BY_MODEL, COLOR_LABEL, COLOR_VAR, KIND_CODE, KIND_LABEL, NO_MONTHLY, TYPE_LABEL, USES_COLOR, USES_METRIC, dimensionOf } from './lib';

const TYPE_ICON: Record<ChartType, typeof IconLine> = { line: IconLine, area: IconArea, bar: IconColumn, table: IconTableView };
const COLORS: WidgetColor[] = ['accent', 'm1', 'm2', 'm3', 'signal'];

/** 换指标时自动跟着换的标题（标题没被手动改过时才换） */
function autoTitle(kind: WidgetKind, m: MetricKey) {
  const label = METRICS[m].label;
  switch (kind) {
    case 'timeseries': return m === 'revenue' ? '月度收入 · 按型号' : `月度${label.replace(/^累计/, '')}`;
    case 'bars': return `${label} · 按${BY_MODEL.includes(m) ? '型号' : '分系统'}`;
    case 'ring': return `${label}构成 · 按型号`;
    default: return label;
  }
}

/**
 * 配置抽屉（编辑状态右侧）：选中组件后改标题、指标、图表类型、颜色，改动立刻反映在组件上。
 * - 图表类型只列 compatibleTypes(kind)；为空（地球、桑基等）时不显示这一项；
 * - 维度由组件类型和指标决定，只读展示；
 * - 没选组件时显示图层列表，点一项即选中；选中空位时提示从组件库放组件。
 */
export function ConfigDrawer({ layout, slot, onSelect, onUpdate, onRemove }: {
  layout: BoardLayout;
  slot: string | null;
  onSelect: (slot: string | null) => void;
  onUpdate: (slot: string, patch: Partial<WidgetConfig>) => void;
  onRemove: (slot: string) => void;
}) {
  const w = slot ? layout.slots[slot] ?? null : null;
  const uid = useId();
  const [touched, setTouched] = useState(false);
  useEffect(() => { setTouched(false); }, [slot, w?.id]);

  if (!slot || !(slot in layout.slots)) {
    const entries = Object.entries(layout.slots);
    return (
      <aside className="vd-ed-cfg" aria-label="组件配置">
        <header className="vd-ed-side-head">
          <p className="vd-kicker"><IconLayers />LAYERS · {String(entries.length).padStart(2, '0')}</p>
          <h2>图层</h2>
          <p className="vd-ed-side-hint">点一个组件，在这里改标题、指标、图表类型和颜色。</p>
        </header>
        <ul className="vd-ed-layers">
          {entries.map(([s, x]) => (
            <li key={s}>
              <button type="button" className={x ? '' : 'is-empty'} onClick={() => onSelect(s)}>
                <span className="vd-ed-layer-slot">{s.toUpperCase()}</span>
                {x ? <><span className="vd-ed-layer-fig"><Glyph w={x} /></span><span className="vd-ed-layer-name">{x.title || KIND_LABEL[x.kind]}</span></>
                  : <><span className="vd-ed-layer-fig is-empty"><IconSlot /></span><span className="vd-ed-layer-name">空位</span></>}
              </button>
            </li>
          ))}
        </ul>
      </aside>
    );
  }

  if (!w) {
    return (
      <aside className="vd-ed-cfg" aria-label="组件配置">
        <header className="vd-ed-side-head is-row">
          <span className="vd-ed-cfg-fig is-empty"><IconSlot size={20} /></span>
          <div>
            <p className="vd-kicker">SLOT {slot.toUpperCase()} · EMPTY</p>
            <h2>空位</h2>
          </div>
          <button type="button" className="vd-icon-btn" onClick={() => onSelect(null)} aria-label="取消选中"><IconClose /></button>
        </header>
        <div className="vd-ed-cfg-empty">
          <p>从左侧组件库点一个组件，就会放进 <b className="vd-mono">{slot.toUpperCase()}</b>；也可以直接拖进来。</p>
          <p className="vd-ed-cfg-note">格位大小由看板布局决定，放进来的组件会自动适应。</p>
        </div>
      </aside>
    );
  }

  const types = compatibleTypes(w.kind);
  const set = (patch: Partial<WidgetConfig>) => onUpdate(slot, patch);
  const monthlyOnly = w.kind === 'stream' || w.kind === 'timeseries';

  return (
    <aside className="vd-ed-cfg" aria-label="组件配置">
      <header className="vd-ed-side-head is-row">
        <span className="vd-ed-cfg-fig"><Glyph w={w} /></span>
        <div>
          <p className="vd-kicker">SLOT {slot.toUpperCase()} · {KIND_CODE[w.kind]}</p>
          <h2>{KIND_LABEL[w.kind]}</h2>
        </div>
        <button type="button" className="vd-icon-btn" onClick={() => onSelect(null)} aria-label="取消选中，回到图层列表"><IconClose /></button>
      </header>

      <div className="vd-ed-cfg-body">
        <Field label="标题" htmlFor={`${uid}-title`}>
          <input id={`${uid}-title`} className="vd-ed-input" value={w.title} maxLength={24}
            onChange={e => { setTouched(true); set({ title: e.target.value }); }}
            onBlur={e => { if (!e.target.value.trim()) set({ title: w.metric ? autoTitle(w.kind, w.metric) : KIND_LABEL[w.kind] }); }} />
        </Field>

        {USES_METRIC[w.kind] && (
          <Field label="指标" group>
            <div className="vd-ed-metrics" role="radiogroup" aria-label="指标">
              {METRIC_KEYS.map(m => {
                const off = monthlyOnly && NO_MONTHLY.includes(m);
                const on = (w.metric ?? '') === m;
                return (
                  <button key={m} type="button" role="radio" aria-checked={on} disabled={off}
                    title={off ? '这个指标只有全年数，没有月度明细' : METRICS[m].desc}
                    className={on ? 'is-on' : ''}
                    onClick={() => set(touched ? { metric: m } : { metric: m, title: autoTitle(w.kind, m) })}>
                    <span>{METRICS[m].label}</span>
                    <small>{METRICS[m].unit === 'pct' ? '%' : '万元'}</small>
                  </button>
                );
              })}
            </div>
          </Field>
        )}

        <Field label="维度">
          <p className="vd-ed-readonly">{dimensionOf(w.kind, w.metric)}<small>由组件类型和指标决定</small></p>
        </Field>

        {types.length > 0 && (
          <Field label="图表类型" group>
            <div className="vd-ed-types" role="radiogroup" aria-label="图表类型">
              {types.map(t => {
                const Icon = TYPE_ICON[t];
                const on = (w.chartType ?? types[0]) === t;
                return (
                  <button key={t} type="button" role="radio" aria-checked={on} className={on ? 'is-on' : ''} onClick={() => set({ chartType: t })}>
                    <Icon /><span>{TYPE_LABEL[t]}</span>
                  </button>
                );
              })}
            </div>
          </Field>
        )}

        {USES_COLOR[w.kind] && (
          <Field label="颜色" group>
            <div className="vd-ed-colors" role="radiogroup" aria-label="颜色">
              {COLORS.map(c => {
                const on = (w.color ?? 'accent') === c;
                return (
                  <button key={c} type="button" role="radio" aria-checked={on} aria-label={COLOR_LABEL[c]} title={COLOR_LABEL[c]}
                    className={on ? 'is-on' : ''} style={{ '--c': COLOR_VAR[c] } as CSSProperties} onClick={() => set({ color: c })} />
                );
              })}
              <span className="vd-ed-colors-name">{COLOR_LABEL[w.color ?? 'accent']}</span>
            </div>
            {w.kind === 'bars' && w.metric && BY_MODEL.includes(w.metric) && <p className="vd-ed-cfg-note">按型号分组时条形用型号固定色。</p>}
          </Field>
        )}
        {!USES_COLOR[w.kind] && <p className="vd-ed-cfg-note">这个组件按型号上色（HX-01 主色、HX-02 青、HX-03 紫），不单独设颜色。</p>}
      </div>

      <footer className="vd-ed-cfg-foot">
        <button type="button" className="vd-btn is-ghost vd-ed-danger" onClick={() => onRemove(slot)}><IconTrash />删除组件</button>
        <span className="vd-mono" title="组件 id">{w.id}</span>
      </footer>
    </aside>
  );
}

function Field({ label, htmlFor, group, children }: { label: string; htmlFor?: string; group?: boolean; children: ReactNode }) {
  if (group) {
    return (
      <fieldset className="vd-ed-field">
        <legend className="vd-ed-field-k">{label}</legend>
        {children}
      </fieldset>
    );
  }
  return (
    <div className="vd-ed-field">
      {htmlFor ? <label className="vd-ed-field-k" htmlFor={htmlFor}>{label}</label> : <p className="vd-ed-field-k">{label}</p>}
      {children}
    </div>
  );
}
