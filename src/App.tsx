import { lazy, Suspense, useEffect, type ComponentType } from 'react';
import { SiteProvider, useSite } from './core/provider';
import { href, navigate, useRoute, type Route } from './core/route';
import { VARIANTS, type VariantId } from './core/config/config';
import { VariantDock } from './core/ui/VariantDock';
import { ConfigPanel } from './core/ui/ConfigPanel';
import './core/fonts.css';
import './core/ui/config-panel.css';

/**
 * 三个设计方案共用一个外壳：数据、风格配置、明暗切换、方案切换条、配置面板。
 * 每个方案是 src/variants/<id>/index.tsx 的默认导出，接收 { route }，自己渲染首页与看板（方案 D 另有问答与资产列表）。
 */
const variants: Record<VariantId, ComponentType<{ route: Route }>> = {
  a: lazy(() => import('./variants/a')),
  b: lazy(() => import('./variants/b')),
  c: lazy(() => import('./variants/c')),
  d: lazy(() => import('./variants/d')),
};

function Shell() {
  const { config, setConfig, data } = useSite();
  const route = useRoute(config.variant);

  useEffect(() => { if (!/^#\/[abcd]/.test(location.hash)) navigate(href(config.variant)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (route.variant !== config.variant) setConfig({ variant: route.variant }); }, [route.variant]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }); }, [route.variant, route.page, route.assetId]);
  useEffect(() => {
    const v = VARIANTS.find(x => x.id === route.variant)!;
    const asset = route.assetId ? data.assets.find(a => a.id === route.assetId) : null;
    document.title = `${asset ? asset.name + ' · ' : ''}${data.meta.title} · 方案 ${v.short} ${v.name}`;
  }, [route, data]);

  const Variant = variants[route.variant];
  return (
    <>
      <Suspense fallback={<div className="dh-boot" aria-busy="true"><span className="dh-boot-dot" />正在载入方案</div>}>
        <Variant route={route} />
      </Suspense>
      <VariantDock route={route} />
      <ConfigPanel />
    </>
  );
}

export default function App() {
  return <SiteProvider><Shell /></SiteProvider>;
}
