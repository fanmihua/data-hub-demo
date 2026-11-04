import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from 'lucide-react';
import type { BillRow } from '../../../core/data/derive';
import { dayLabel, wan } from '../../../core/data/format';
import { StatusBadge, useModelColor } from '../lib';

type SortKey = 'date' | 'amount' | 'paid';

/** 明细表：可排序；点一行（或行首按钮）打开付款链路抽屉。390 宽度下变成卡片列表。 */
export function BillTable({ rows, onOpen, openId }: { rows: BillRow[]; onOpen: (id: string, el: HTMLElement) => void; openId: string | null }) {
  const color = useModelColor();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 });
  const sorted = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => {
      const va = sort.key === 'date' ? a.date : sort.key === 'amount' ? a.amount : a.paid;
      const vb = sort.key === 'date' ? b.date : sort.key === 'amount' ? b.amount : b.paid;
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
    });
    return out;
  }, [rows, sort]);

  const head = (key: SortKey, label: string, num = false) => {
    const on = sort.key === key;
    const Icon = on ? (sort.dir === 1 ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <th scope="col" className={num ? 'is-num' : ''} aria-sort={on ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
        <button type="button" className="va-th-sort" onClick={() => setSort(s => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }))}>
          {label}<Icon size={13} aria-hidden="true" />
        </button>
      </th>
    );
  };

  if (!rows.length) return <p className="va-empty">当前筛选条件下没有报账单。换一个型号或期间试试。</p>;

  return (
    <div className="va-bills-wrap">
      <table className="va-bills">
        <caption className="va-sr">报账单明细，共 {rows.length} 张。点击一行查看付款链路。</caption>
        <thead>
          <tr>
            <th scope="col">报账单</th>
            {head('date', '日期')}
            <th scope="col">型号 · 分系统</th>
            <th scope="col" className="va-col-contract">合同 / 往来单位</th>
            {head('amount', '金额（万元）', true)}
            {head('paid', '已付（万元）', true)}
            <th scope="col">状态</th>
            <th scope="col" className="va-col-go"><span className="va-sr">操作</span></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(b => (
            <tr key={b.id} className={openId === b.id ? 'is-open' : ''} onClick={e => onOpen(b.id, e.currentTarget.querySelector('button') ?? e.currentTarget)}>
              <td data-label="报账单">
                <button type="button" className="va-bill-id" onClick={e => { e.stopPropagation(); onOpen(b.id, e.currentTarget); }} aria-haspopup="dialog">
                  <span className="va-mono">{b.id}</span>
                </button>
                <span className="va-bill-sum">{b.summary}</span>
              </td>
              <td data-label="日期" className="va-num">{dayLabel(b.date)}</td>
              <td data-label="型号 · 分系统">
                <span className="va-bill-model"><i style={{ background: color(b.model) }} aria-hidden="true" />{b.model}</span>
                <span className="va-bill-sub">{b.system} · {b.component}</span>
              </td>
              <td data-label="合同 / 往来单位" className="va-col-contract">
                <span>{b.contractName ?? '院内支出（无合同）'}</span>
                <span className="va-bill-sub">{b.unit}</span>
              </td>
              <td data-label="金额（万元）" className="is-num va-num">{wan(b.amount)}</td>
              <td data-label="已付（万元）" className="is-num va-num">
                {wan(b.paid)}
                <span className="va-paybar" aria-hidden="true"><span style={{ transform: `scaleX(${b.amount ? Math.min(1, b.paid / b.amount) : 0})` }} /></span>
              </td>
              <td data-label="状态"><StatusBadge status={b.status} /></td>
              <td className="va-col-go" aria-hidden="true"><ChevronRight size={16} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
