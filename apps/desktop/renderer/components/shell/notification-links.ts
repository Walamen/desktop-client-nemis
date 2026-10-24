import { toDesktopRoute } from '@/components/county/notifications/links';

const COUNTY = '/government/county';

/**
 * A notification's link (a portal-web route) as a route inside the given
 * desktop portal, or null when it points elsewhere (another portal, off-app,
 * empty) so the caller can fall back to the Notifications page.
 */
export function toPortalRoute(link: string | null | undefined, basePath: string): string | null {
  if (!link) return null;
  if (basePath === COUNTY) return toDesktopRoute(link);
  if (link.startsWith('//')) return null;
  const [path = ''] = link.split('?');
  return path === basePath || path.startsWith(`${basePath}/`) ? link : null;
}
