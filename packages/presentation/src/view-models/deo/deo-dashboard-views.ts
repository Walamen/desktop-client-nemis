import type { DeoAlert, DeoDashboardResult, DeoSchoolRow } from '@nemis-desktop/types';

/** The page reads the wire shape as it is: every figure is already computed. */
export type DeoDashboardView = DeoDashboardResult;

/** Rows per page in the dashboard tables. */
export const PAGE_SIZE = 10;

export type PerformanceFilter = '' | 'Good' | 'Warning' | 'Critical';

/** "Detailed School Performance": search by name, then the status filter,
 * over the whole district. Paging comes after (see pageOf). */
export function filterPerformance(
  schools: readonly DeoSchoolRow[],
  search: string,
  status: PerformanceFilter,
): DeoSchoolRow[] {
  const term = search.trim().toLowerCase();
  return schools.filter(
    (school) =>
      (!term || school.name.toLowerCase().includes(term)) && (!status || school.performanceStatus === status),
  );
}

export interface Page<T> {
  readonly rows: T[];
  /** The page actually shown: the request clamped to what exists. */
  readonly page: number;
  readonly totalPages: number;
  readonly total: number;
}

/** One page of ten. A page past the end shows the last page, so a filter
 * that shortens the list never leaves the table blank. */
export function pageOf<T>(rows: readonly T[], page: number): Page<T> {
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const shown = Math.min(Math.max(1, Math.trunc(page) || 1), totalPages);
  return {
    rows: rows.slice((shown - 1) * PAGE_SIZE, shown * PAGE_SIZE),
    page: shown,
    totalPages,
    total: rows.length,
  };
}

/** "Incident Monitoring" severity filter; '' shows every alert. */
export function filterAlerts(alerts: readonly DeoAlert[], severity: string): DeoAlert[] {
  if (!severity) return [...alerts];
  const wanted = severity.toUpperCase();
  return alerts.filter((alert) => alert.severity.toUpperCase() === wanted);
}

export type Greeting = 'Good morning' | 'Good afternoon' | 'Good evening';

/** Greeting for an hour of the day (0–23), in the device's local time. */
export function greetingFor(hour: number): Greeting {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** The line under the officer's name. A name that is not known is left out;
 * a placeholder word is never printed in its place. */
export function bannerLine(parts: {
  title: string;
  district?: string | null;
  county?: string | null;
  date: Date;
}): string {
  const date = parts.date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  return [parts.title, parts.district, parts.county, date]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(' · ');
}

/** ["PRIMARY", "JUNIOR_HIGH"] → "Primary, Junior High"; none → "—". */
export function formatLevels(levels: readonly string[]): string {
  if (levels.length === 0) return '—';
  return levels
    .map((level) =>
      level
        .toLowerCase()
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' '),
    )
    .join(', ');
}
