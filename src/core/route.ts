import { useEffect, useState } from 'react';
import type { VariantId } from './config/config';

/**
 * 哈希路由：
 *   #/a            A 版首页
 *   #/a/board/:id  A 版看板（id 为资产 id，例如 contracts / expenses / operations）
 * b、c 同理。首页内的锚点用 #/a?section=domains 之类的查询参数，不占用路由。
 *   #/d/chat       问答（方案 D）
 *   #/d/assets     资产列表（方案 D）
 * 其他方案收到 chat / assets 时按首页处理。
 */
export type Page = 'home' | 'board' | 'chat' | 'assets';

export interface Route {
  variant: VariantId;
  page: Page;
  assetId: string | null;
  query: URLSearchParams;
}

export function parseRoute(hash: string, fallback: VariantId): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path, qs = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  const variant = (['a', 'b', 'c', 'd'].includes(parts[0]) ? parts[0] : fallback) as VariantId;
  const page: Page = parts[1] === 'board' && parts[2] ? 'board' : parts[1] === 'chat' ? 'chat' : parts[1] === 'assets' ? 'assets' : 'home';
  return { variant, page, assetId: page === 'board' ? decodeURIComponent(parts[2]) : null, query: new URLSearchParams(qs) };
}

export function href(variant: VariantId, page: Page = 'home', assetId?: string | null, query?: Record<string, string>) {
  const qs = query && Object.keys(query).length ? `?${new URLSearchParams(query)}` : '';
  if (page === 'board' && assetId) return `#/${variant}/board/${encodeURIComponent(assetId)}${qs}`;
  if (page === 'chat' || page === 'assets') return `#/${variant}/${page}${qs}`;
  return `#/${variant}${qs}`;
}

export function navigate(to: string) {
  if (location.hash !== to) location.hash = to;
}

export function useRoute(fallback: VariantId): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash, fallback));
  useEffect(() => {
    const on = () => setRoute(parseRoute(location.hash, fallback));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, [fallback]);
  return route;
}
