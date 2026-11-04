import type { CSSProperties } from 'react';
import { useSite } from '../../../core/provider';
import { wan } from '../../../core/data/format';
import type { TickerEvent } from '../model/types';
import { IconBill, IconPayment } from './icons';
import { useModelColor } from './lib';

/**
 * 消息条：报账、付款事件横向循环滚动，悬停或键盘聚焦时暂停。
 * 每条都带自己的日期（不冒充实时）；关闭特效时不滚动，可以横向拖动查看。
 */
export function Ticker({ events }: { events: TickerEvent[] }) {
  const { fx } = useSite();
  const colorOf = useModelColor();
  if (!events.length) {
    return <div className="vd-ticker is-empty" role="status"><span className="vd-ticker-empty">暂无报账与付款记录</span></div>;
  }
  const loop = fx.motion && events.length > 2;
  const row = (hidden: boolean) => (
    <ul className="vd-ticker-list" aria-hidden={hidden || undefined}>
      {events.map(e => (
        <li key={`${e.kind}-${e.id}`} className={`vd-tick is-${e.kind}`}>
          <time className="vd-tick-date" dateTime={e.date}>{e.date.slice(5).replace('-', '/')}</time>
          <span className="vd-tick-kind">{e.kind === 'bill' ? <IconBill /> : <IconPayment />}{e.kind === 'bill' ? '报账' : '付款'}</span>
          <i className="vd-tick-dot" style={{ background: colorOf(e.model) }} aria-hidden="true" />
          <span className="vd-tick-text">{e.text}</span>
          <b className="vd-tick-amt">{wan(e.amount)}<small>万元</small></b>
        </li>
      ))}
    </ul>
  );
  // 每条约 4.2 秒，fx 轻量时放慢一半
  const dur = events.length * 4.2 * (fx.intensity >= 1 ? 1 : 1.6);
  return (
    <section className={`vd-ticker${loop ? ' is-loop' : ''}`} aria-label="最近的报账与付款（演示数据）" tabIndex={loop ? 0 : undefined}>
      <div className="vd-ticker-track" style={{ '--vd-ticker-dur': `${dur}s` } as CSSProperties}>
        {row(false)}
        {loop && row(true)}
      </div>
    </section>
  );
}
