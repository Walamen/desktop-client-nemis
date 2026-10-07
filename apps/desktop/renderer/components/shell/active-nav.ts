import type { SidebarConfig } from './sidebarConfig';

/** Strips one trailing slash (the static export uses trailingSlash: true), keeping '/' itself. */
export function normalizePath(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

/** Which sidebar item's href is active for `pathname`. Items match exactly or
 * as a path-segment prefix (so sub-pages highlight their parent). The longest
 * match wins. The dashboard item, and any item whose href is the role's home
 * page (`basePath`), match exactly only, since they would otherwise prefix
 * every page in the portal. */
export function resolveActiveHref(pathname: string, config: SidebarConfig, basePath: string): string | null {
  const path = normalizePath(pathname);
  const home = normalizePath(basePath);
  if (config.dashboardItem && normalizePath(config.dashboardItem.href) === path) return config.dashboardItem.href;

  let best: { href: string; length: number } | null = null;
  for (const group of config.navGroups) {
    for (const item of group.items) {
      for (const raw of [item.href, ...(item.alsoActiveOn ?? [])]) {
        const candidate = normalizePath(raw);
        const isMatch = candidate === home
          ? path === candidate
          : path === candidate || path.startsWith(`${candidate}/`);
        if (isMatch && (best === null || candidate.length > best.length)) {
          best = { href: item.href, length: candidate.length };
        }
      }
    }
  }
  return best?.href ?? null;
}
