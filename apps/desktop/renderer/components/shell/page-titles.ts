import type { DesktopPortalRole } from '@nemis-desktop/types';
import { headerConfigs, sidebarConfigs } from './sidebarConfig';
import { normalizePath } from './active-nav';

const titleCase = (s: string) => s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function sidebarItemName(pathname: string, role: DesktopPortalRole): string | undefined {
  const config = sidebarConfigs[role];
  if (config.dashboardItem?.href === pathname) return config.dashboardItem.name;
  for (const group of config.navGroups) {
    const match = group.items.find((item) => item.href === pathname);
    if (match) return match.name;
  }
  return undefined;
}

export function resolvePageTitle(
  pathname: string,
  role: DesktopPortalRole,
): { title: string; segments: string[] } {
  const header = headerConfigs[role];
  const path = normalizePath(pathname);
  const lastSegment = path.split('/').filter(Boolean).at(-1) ?? '';
  const title =
    header.pageTitles?.[path] ??
    sidebarItemName(path, role) ??
    titleCase(lastSegment);
  const segments = path
    .slice(header.basePath.length)
    .split('/')
    .filter(Boolean)
    .map(titleCase);
  return { title, segments: [header.breadcrumbRoot, ...segments] };
}
