import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { CornerDownLeft, FileText, LayoutGrid, Search as SearchIcon, Satellite, Layers, X } from 'lucide-react';
import { useSite } from '../../../core/provider';
import { navigate } from '../../../core/route';
import { wanLabel } from '../../../core/data/format';
import { link, scrollToSection } from '../lib';

interface Hit { id: string; group: string; title: string; sub: string; to: string; section?: string; Icon: typeof SearchIcon }

/** 检索：在本地演示数据里查看板、业务域、型号、合同、报账单。回车跳转。 */
export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, derived, fx } = useSite();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const last = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    last.current = document.activeElement as HTMLElement | null;
    setQ(''); setSel(0);
    const t = setTimeout(() => input.current?.focus(), 20);
    return () => { clearTimeout(t); last.current?.focus?.(); };
  }, [open]);

  const all: Hit[] = useMemo(() => [
    ...data.assets.map(a => ({ id: `a:${a.id}`, group: '看板', title: a.name, sub: `${a.code} · ${a.tags.join(' ')}`, to: link('board', a.id), Icon: LayoutGrid })),
    ...data.domains.map(d => ({ id: `d:${d.id}`, group: '业务域', title: d.name, sub: `${d.english} · ${d.status === 'ready' ? '已开放' : '筹备中'} · ${d.desc}`, to: link('home', null, { section: 'domains' }), section: 'domains', Icon: Layers })),
    ...derived.models.map(m => ({ id: `m:${m.id}`, group: '型号', title: m.id, sub: `${m.dept} · 收入 ${wanLabel(m.revenue)}`, to: link('board', 'operations', { model: m.id }), Icon: Satellite })),
    ...data.contracts.map(c => ({ id: `c:${c.id}`, group: '合同', title: c.name, sub: `${c.id} · ${c.unit} · ${wanLabel(c.amount)}`, to: link('board', 'contracts', { contract: c.id }), Icon: FileText })),
    ...derived.bills.map(b => ({ id: `b:${b.id}`, group: '报账单', title: `${b.id} ${b.summary}`, sub: `${b.date} · ${b.model} · ${b.system} · ${wanLabel(b.amount)} · ${b.status}`, to: link('board', 'contracts', { bill: b.id }), Icon: FileText })),
  ], [data, derived]);

  const hits = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return all.filter(h => h.group === '看板' || h.group === '型号');
    return all.filter(h => words.every(w => `${h.title} ${h.sub} ${h.group}`.toLowerCase().includes(w))).slice(0, 12);
  }, [q, all]);

  if (!open) return null;

  const go = (h: Hit) => {
    onClose();
    if (h.section && scrollToSection(h.section, fx.motion)) return;
    navigate(h.to);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(hits.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
    else if (e.key === 'Enter' && hits[sel]) { e.preventDefault(); go(hits[sel]); }
    else if (e.key === 'Tab') { e.preventDefault(); input.current?.focus(); }
  };

  return (
    <div className="va-search-layer" onKeyDown={onKey}>
      <button className="va-search-scrim" aria-label="关闭检索" tabIndex={-1} onClick={onClose} />
      <div className="va-search" role="dialog" aria-modal="true" aria-label="检索演示数据">
        <div className="va-search-bar">
          <SearchIcon size={18} aria-hidden="true" />
          <input ref={input} value={q} onChange={e => { setQ(e.target.value); setSel(0); }} placeholder={`查看板、型号、合同或报账单号${derived.models[0] ? `，例如 ${derived.models[0].id}` : ''}${derived.bills[0] ? `、${derived.bills[0].id}` : ''}`}
            aria-label="检索关键词" aria-controls="va-search-list" aria-activedescendant={hits[sel] ? `va-hit-${sel}` : undefined} role="combobox" aria-expanded="true" />
          <button className="va-icon-btn" onClick={onClose} aria-label="关闭"><X size={16} /></button>
        </div>
        <ul id="va-search-list" className="va-search-list" role="listbox" aria-label="检索结果">
          {hits.length === 0 && <li className="va-search-empty">没有匹配的结果。试试型号编号或合同名称里的词。</li>}
          {hits.map((h, i) => (
            <li key={h.id} id={`va-hit-${i}`} role="option" aria-selected={i === sel} className={i === sel ? 'is-sel' : ''}
              onPointerEnter={() => setSel(i)} onClick={() => go(h)}>
              <h.Icon size={16} aria-hidden="true" />
              <span className="va-search-main"><b>{h.title}</b><span>{h.sub}</span></span>
              <span className="va-mono">{h.group}</span>
              {i === sel && <CornerDownLeft size={14} aria-hidden="true" className="va-search-enter" />}
            </li>
          ))}
        </ul>
        <p className="va-search-foot va-mono">↑↓ 选择 · ENTER 打开 · ESC 关闭 · 仅检索本地演示数据</p>
      </div>
    </div>
  );
}
