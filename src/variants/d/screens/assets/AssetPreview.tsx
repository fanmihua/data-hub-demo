import { useState } from 'react';
import type { Derived } from '../../../../core/data/derive';
import type { DataHubData } from '../../../../core/data/types';
import { int, monthShort, pct, wan } from '../../../../core/data/format';
import { BOARD_LAYOUTS } from '../../model/boards';
import { METRICS, lastMonths } from '../../model/metrics';
import type { CatalogField, CatalogItem } from '../../model/types';
import { BigNumber } from '../../ui/BigNumber';
import { IconArrowRight, IconChart, IconClock, IconSearch, IconSparkle, IconTable } from './icons';
import { dHref } from '../../ui/lib';
import { TimeSeries } from '../../viz/TimeSeries';
import type { AssetRow } from './AssetTable';
import { GLYPH, Hit } from './AssetTable';
import { Lineage } from './Lineage';
import { GROUP_LABEL, headline, lineageOf, metricKeyOf, relatedBoard, trendIsPct } from './lib';

/**
 * 右侧预览：数黑体大标题、说明、四格元信息、预览图（大数字 + 近 6 个月小图）、血缘、字段表，
 * 底部固定两个操作：打开看板、就这个资产提问。切换资产时内容轻微淡入（关闭特效时直接换）。
 */
const FIELD_GLYPH: Record<CatalogField['type'], string> = { 编号: 'ID', 文本: 'Aa', 数值: '#', 日期: 'D' };

export function AssetPreview({ row, data, d, motion, planned = [], q = '' }: { row: AssetRow | null; data: DataHubData; d: Derived; motion: boolean; planned?: CatalogItem[]; q?: string }) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  if (!row) {
    // 只剩筹备中的业务域：如实说明，不给可点的操作
    if (planned.length) {
      return (
        <div className="vd-as-pv is-empty">
          <div className="vd-as-empty">
            <span className="vd-as-empty-ic is-planned" aria-hidden="true"><IconClock size={20} /></span>
            <p className="vd-as-empty-h">{planned.map(p => p.domainName).join('、')}{planned.length > 1 ? '等业务域' : '业务域'}筹备中</p>
            <p className="vd-as-empty-t">{planned.length === 1 ? `${planned[0].desc.replace(/。?业务域筹备中[\s\S]*$/, '')}。` : ''}暂无可用资产，接入数据后会出现在这里。</p>
          </div>
        </div>
      );
    }
    return (
      <div className="vd-as-pv is-empty">
        <div className="vd-as-empty">
          <span className="vd-as-empty-ic" aria-hidden="true"><IconSearch size={20} /></span>
          <p className="vd-as-empty-h">没有选中的资产</p>
          <p className="vd-as-empty-t">调整搜索或筛选后，从列表里选一项查看预览。</p>
        </div>
      </div>
    );
  }

  const { item, group, code } = row;
  const Ic = GLYPH[group];
  const h = headline(item, d);
  const board = relatedBoard(item);
  const boardName = board ? data.assets.find(a => a.id === board)?.name ?? BOARD_LAYOUTS[board].title : null;
  const isPct = trendIsPct(item, d);
  const labels = lastMonths(d, item.trend.length || 6).map(monthShort);
  const key = metricKeyOf(item);
  const side = item.kind === 'table'
    ? { k: '合计金额', v: item.valueLabel ?? '—' }
    : item.kind === 'metric' && key
      ? { k: '口径', v: METRICS[key].desc }
      : { k: '来源', v: data.assets.find(a => `board:${a.id}` === item.id)?.source ?? '—' };
  const lineage = lineageOf(item, data, d);

  return (
    <div className="vd-as-pv">
      <div className="vd-as-pv-scroll">
        <div className={`vd-as-pv-in${motion ? ' is-anim' : ''}`} key={item.id}>
          <header className="vd-as-pv-head">
            <p className="vd-as-pv-path">
              <span className={`vd-as-glyph is-${group} is-sm`} aria-hidden="true"><Ic /></span>
              <span className={`vd-as-kind is-${group}`}>{GROUP_LABEL[group]}</span>
              <span>{item.domainName}</span>
              <span className="vd-as-dotsep" aria-hidden="true" />
              <span className="vd-as-code">{code}</span>
            </p>
            <h2 className="vd-as-pv-title">{item.name}</h2>
            <p className="vd-as-pv-desc"><Hit text={item.desc} q={q} /></p>
          </header>

          <dl className="vd-as-pv-meta">
            <div><dt>负责部门</dt><dd>{item.owner}</dd></div>
            <div><dt>更新时间</dt><dd className="is-mono">{item.updated}</dd></div>
            <div><dt>字段</dt><dd>{int(item.fields.length)} 个</dd></div>
            <div>
              <dt>关联看板</dt>
              <dd>{board ? <a className="vd-link" href={dHref('board', board)}>{boardName}</a> : '—'}</dd>
            </div>
          </dl>

          <figure className="vd-as-fig">
            <div className="vd-as-fig-head">
              {h && <BigNumber value={h.value} format={h.format} unit={h.unit} label={h.label} size="md" />}
              <div className="vd-as-fig-side">
                <span>{side.k}</span>
                <b title={side.v}>{side.v}</b>
              </div>
            </div>
            <div className="vd-as-fig-bar">
              <figcaption className="vd-as-fig-cap">近 6 个月 · {item.trendLabel.replace('（元）', '')}</figcaption>
              <div className="vd-seg vd-as-seg is-xs" role="radiogroup" aria-label="预览图显示方式">
                <button type="button" role="radio" aria-checked={view === 'chart'} className={view === 'chart' ? 'is-on' : ''} onClick={() => setView('chart')}>
                  <IconChart /><span className="vd-sr">图表</span>
                </button>
                <button type="button" role="radio" aria-checked={view === 'table'} className={view === 'table' ? 'is-on' : ''} onClick={() => setView('table')}>
                  <IconTable /><span className="vd-sr">数据表</span>
                </button>
              </div>
            </div>
            <div className="vd-as-fig-plot">
              <TimeSeries
                labels={labels}
                series={[{ id: 'v', label: isPct ? item.trendLabel : item.trendLabel.replace('（元）', '（万元）'), color: 'var(--accent)', values: item.trend }]}
                type={view === 'table' ? 'table' : isPct ? 'area' : 'bar'}
                height="100%"
                unit={isPct ? undefined : '万元'}
                valueFormat={isPct ? (n => pct(n)) : (n => wan(n))}
                ariaLabel={`${item.name}近 6 个月${item.trendLabel}`}
              />
            </div>
          </figure>

          {lineage.length > 0 && (
            <section className="vd-as-sec" aria-labelledby={`vd-as-lin-${item.id}`}>
              <h3 className="vd-as-sec-h" id={`vd-as-lin-${item.id}`}>
                血缘<span className="vd-as-sec-en">LINEAGE</span>
                <span className="vd-as-sec-note">流光方向即数据流向</span>
              </h3>
              <Lineage nodes={lineage} motion={motion} />
            </section>
          )}

          <section className="vd-as-sec" aria-labelledby={`vd-as-f-${item.id}`}>
            <h3 className="vd-as-sec-h" id={`vd-as-f-${item.id}`}>
              字段<span className="vd-as-sec-en">SCHEMA</span>
              <span className="vd-as-sec-n">{item.fields.length}</span>
            </h3>
            <ul className="vd-as-fields">
              {item.fields.map(f => (
                <li key={f.name}>
                  <span className={`vd-as-ft is-${FIELD_GLYPH[f.type] === '#' ? 'num' : FIELD_GLYPH[f.type] === 'D' ? 'date' : FIELD_GLYPH[f.type] === 'ID' ? 'id' : 'text'}`} title={f.type}>
                    <i aria-hidden="true">{FIELD_GLYPH[f.type]}</i>{f.type}
                  </span>
                  <span className="vd-as-fname">{f.name}</span>
                  <span className="vd-as-fdesc" title={f.desc}>{f.desc}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <footer className="vd-as-pv-foot">
        {board ? (
          <a className="vd-btn is-primary vd-as-act" href={dHref('board', board)} title={`打开看板「${boardName}」`}>
            打开看板<IconArrowRight />
          </a>
        ) : (
          <button type="button" className="vd-btn is-primary vd-as-act" disabled>打开看板</button>
        )}
        <a className="vd-btn vd-as-act" href={dHref('chat', null, { q: `${item.name}怎么样` })}>
          <IconSparkle />就这个资产提问
        </a>
      </footer>
    </div>
  );
}
