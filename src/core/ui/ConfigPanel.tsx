import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ACCENTS, VARIANTS, resolveAccent, type Density, type FxLevel, type ThemeMode, type VariantId } from '../config/config';
import { useSite } from '../provider';
import { href, navigate, parseRoute } from '../route';
import './config-panel.css';

type Tab = 'style' | 'data';

/**
 * 「风格与数据」面板：三版共用。
 * 风格：方案、明暗、主题色、特效强度、密度。数据：查看 / 粘贴 / 导入 JSON，校验后应用。
 * 所有修改只存在本机浏览器，「恢复默认」回到 public/config 下的文件。
 */
export function ConfigPanel() {
  const { panelOpen, setPanelOpen, config, setConfig, resetConfig, isDark, data, dataSource, setData, resetData, defaultData } = useSite();
  const [tab, setTab] = useState<Tab>('style');
  const [draft, setDraft] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!panelOpen) return;
    lastFocus.current = document.activeElement as HTMLElement | null;
    setDraft(JSON.stringify(data, null, 2));
    setErrors([]); setNotice('');
    const t = setTimeout(() => dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus(), 30);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPanelOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); lastFocus.current?.focus?.(); };
  }, [panelOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!panelOpen) return null;

  const switchVariant = (v: VariantId) => {
    const r = parseRoute(location.hash, config.variant);
    setConfig({ variant: v });
    navigate(href(v, r.page, r.assetId));
  };

  const apply = () => {
    let parsed: unknown;
    try { parsed = JSON.parse(draft); } catch (e) { setErrors([`JSON 格式不对：${e instanceof Error ? e.message : String(e)}`]); setNotice(''); return; }
    const errs = setData(parsed);
    setErrors(errs);
    setNotice(errs.length ? '' : '已应用。页面上的数字和图表已按新数据更新。');
  };
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDraft(await file.text());
    setErrors([]); setNotice(`已读入 ${file.name}，检查无误后点「应用数据」。`);
    e.target.value = '';
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'datahub-data.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const accentNow = resolveAccent(config, isDark);
  const modes: { v: ThemeMode; label: string }[] = [{ v: 'light', label: '浅色' }, { v: 'dark', label: '深色' }, { v: 'system', label: '跟随系统' }];
  const fxs: { v: FxLevel; label: string; hint: string }[] = [
    { v: 'full', label: '完整', hint: '全部动画与背景特效' },
    { v: 'subtle', label: '轻量', hint: '保留过渡，减弱背景特效' },
    { v: 'off', label: '关闭', hint: '静态展示，适合投屏与低配电脑' },
  ];
  const densities: { v: Density; label: string }[] = [{ v: 'comfortable', label: '宽松' }, { v: 'compact', label: '紧凑' }];

  return (
    <div className="dh-panel-layer">
      <button className="dh-panel-scrim" aria-label="关闭风格与数据面板" onClick={() => setPanelOpen(false)} />
      <div ref={dialogRef} className="dh-panel" role="dialog" aria-modal="true" aria-labelledby="dh-panel-title">
        <header className="dh-panel-head">
          <div>
            <h2 id="dh-panel-title">风格与数据</h2>
            <p>修改只保存在这台电脑的浏览器里。</p>
          </div>
          <button className="dh-icon-btn" onClick={() => setPanelOpen(false)} aria-label="关闭">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </header>
        <div className="dh-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'style'} onClick={() => setTab('style')} data-autofocus>风格</button>
          <button role="tab" aria-selected={tab === 'data'} onClick={() => setTab('data')}>数据{dataSource === 'custom' && <span className="dh-dot" aria-label="已使用自定义数据" />}</button>
        </div>

        {tab === 'style' ? (
          <div className="dh-panel-body">
            <fieldset className="dh-field">
              <legend>设计方案</legend>
              <div className="dh-variant-list">
                {VARIANTS.map(v => (
                  <button key={v.id} className="dh-variant" aria-pressed={config.variant === v.id} onClick={() => switchVariant(v.id)}>
                    <b>{v.short}</b><span><strong>{v.name}</strong><small>{v.tagline}</small></span>
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="dh-field">
              <legend>明暗</legend>
              <div className="dh-seg">{modes.map(m => <button key={m.v} aria-pressed={config.mode === m.v} onClick={() => setConfig({ mode: m.v })}>{m.label}</button>)}</div>
            </fieldset>
            <fieldset className="dh-field">
              <legend>主题色 <span className="dh-muted">当前：{accentNow.name}</span></legend>
              <div className="dh-swatches">
                <button className="dh-swatch dh-swatch-auto" aria-pressed={config.accent === 'auto'} onClick={() => setConfig({ accent: 'auto' })} title="跟随方案默认色">方案默认</button>
                {ACCENTS.map(a => (
                  <button key={a.id} className="dh-swatch" aria-pressed={config.accent === a.id} onClick={() => setConfig({ accent: a.id })} title={a.name} aria-label={a.name}>
                    <i style={{ background: isDark ? a.dark : a.light }} />
                    <span>{a.name}</span>
                  </button>
                ))}
                <label className="dh-swatch dh-custom" title="自定义颜色">
                  <input id="dh-accent-custom" type="color" value={/^#/.test(config.accent) ? config.accent : accentNow.hex} onChange={e => setConfig({ accent: e.target.value })} aria-label="自定义主题色" />
                  <span>自定义</span>
                </label>
              </div>
            </fieldset>
            <fieldset className="dh-field">
              <legend>特效强度</legend>
              <div className="dh-seg">{fxs.map(f => <button key={f.v} aria-pressed={config.fx === f.v} onClick={() => setConfig({ fx: f.v })} title={f.hint}>{f.label}</button>)}</div>
              <p className="dh-hint">{fxs.find(f => f.v === config.fx)?.hint}。系统开启「减少动态效果」时会自动关闭动画。</p>
            </fieldset>
            <fieldset className="dh-field">
              <legend>信息密度</legend>
              <div className="dh-seg">{densities.map(d => <button key={d.v} aria-pressed={config.density === d.v} onClick={() => setConfig({ density: d.v })}>{d.label}</button>)}</div>
            </fieldset>
            <div className="dh-actions"><button className="dh-btn" onClick={resetConfig}>恢复默认风格</button></div>
          </div>
        ) : (
          <div className="dh-panel-body">
            <p className="dh-hint">
              当前使用<b>{dataSource === 'custom' ? '自定义数据' : '默认演示数据'}</b>（{data.models.length} 个型号、{data.contracts.length} 份合同、{data.bills.length} 张报账单）。
              可以直接改下面的 JSON，或导入同样结构的文件；结构说明见项目里的 public/config/data.json。金额单位为元。
            </p>
            <label className="dh-label" htmlFor="dh-data-json">数据 JSON</label>
            <textarea id="dh-data-json" className="dh-code" spellCheck={false} value={draft} onChange={e => { setDraft(e.target.value); setNotice(''); }} />
            {errors.length > 0 && (
              <div className="dh-errors" role="alert">
                <strong>没有应用，请先修正：</strong>
                <ul>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
              </div>
            )}
            {notice && <p className="dh-notice" role="status">{notice}</p>}
            <div className="dh-actions">
              <button className="dh-btn dh-btn-primary" onClick={apply}>应用数据</button>
              <label className="dh-btn">导入文件<input id="dh-data-file" type="file" accept="application/json,.json" onChange={onFile} hidden /></label>
              <button className="dh-btn" onClick={download}>下载当前数据</button>
              <button className="dh-btn" onClick={() => { resetData(); setDraft(JSON.stringify(defaultData, null, 2)); setNotice('已恢复默认演示数据。'); setErrors([]); }}>恢复默认数据</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
