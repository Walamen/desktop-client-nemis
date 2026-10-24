import { toDesktopRoute } from '@/components/county/notifications/links';
import { academicSetupHref } from '@/lib/academic-setup';

const COUNTY = '/government/county';
const SCHOOL_ADMIN = '/government/school-admin';
const TEACHER = '/government/teacher';

/** Web (portal-web) route -> desktop page, for the links the NEMIS server writes. */
const SCHOOL_ADMIN_ROUTES: Record<string, string> = {
  [`${SCHOOL_ADMIN}/grades`]: academicSetupHref('windows'),
  [`${SCHOOL_ADMIN}/staff`]: `${SCHOOL_ADMIN}/teachers-staff`,
  [`${SCHOOL_ADMIN}/notifications`]: `${SCHOOL_ADMIN}/notifications`,
  [SCHOOL_ADMIN]: SCHOOL_ADMIN,
};
const TEACHER_ROUTES: Record<string, string> = {
  [`${TEACHER}/grade-entry`]: `${TEACHER}/grades`,
  [`${TEACHER}/classes`]: `${TEACHER}/my-classes`,
  [`${TEACHER}/notifications`]: `${TEACHER}/notifications`,
  [TEACHER]: TEACHER,
};

/**
 * A notification's link (a portal-web route) as a route inside the given
 * desktop portal, or null when the desktop has no such page (another portal,
 * off-app, empty, unknown) so the caller can fall back to the Notifications page.
 */
export function toPortalRoute(link: string | null | undefined, basePath: string): string | null {
  if (!link || link.startsWith('//')) return null;
  if (basePath === COUNTY) return toDesktopRoute(link);
  const [path = ''] = link.split('?');
  const clean = path.length > 1 ? path.replace(/\/+$/, '') : path;
  if (basePath === SCHOOL_ADMIN) return SCHOOL_ADMIN_ROUTES[clean] ?? null;
  if (basePath === TEACHER) {
    const submissions = /^\/government\/teacher\/assignments\/([^/]+)\/submissions$/.exec(clean);
    if (submissions?.[1]) return `${TEACHER}/assignment/detail?id=${encodeURIComponent(decodeURIComponent(submissions[1]))}`;
    return TEACHER_ROUTES[clean] ?? null;
  }
  return null;
}
