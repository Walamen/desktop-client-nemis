/** Sections with a desktop detail page (static export: `/<section>/details?id=`). */
const DETAIL_SECTIONS = new Set(['districts', 'parents', 'schools', 'students', 'teachers']);
/** Real sub-pages that are not record ids. */
const STATIC_PAGES = new Set(['create', 'bulk-import', 'details', 'generate']);
const COUNTY = '/government/county';

/**
 * A notification's link (a portal-web route) as a desktop route: web detail
 * pages `/government/county/<section>/<id>` become `<section>/details?id=`,
 * other County pages stay; anything outside the County portal, or off the
 * app, gives null and the page hides the link.
 */
export function toDesktopRoute(link: string | null | undefined): string | null {
  if (!link || !link.startsWith(`${COUNTY}`) || link.startsWith('//')) return null;
  const [path = '', query] = link.split('?');
  if (path !== COUNTY && !path.startsWith(`${COUNTY}/`)) return null;
  const segments = path.slice(COUNTY.length + 1).split('/').filter(Boolean);
  if (segments.length === 2) {
    const [section = '', id = ''] = segments;
    if (DETAIL_SECTIONS.has(section) && !STATIC_PAGES.has(id)) {
      return `${COUNTY}/${section}/details?id=${encodeURIComponent(decodeURIComponent(id))}`;
    }
  }
  return query ? `${path}?${query}` : path;
}
