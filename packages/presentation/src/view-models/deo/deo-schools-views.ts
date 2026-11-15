import type { DeoSchoolRow } from '@nemis-desktop/types';

export const SCHOOL_TABS = ['All', 'Compliant', 'Needs Review', 'Flagged', 'Primary', 'Secondary'] as const;
export type SchoolTab = (typeof SCHOOL_TABS)[number];

type TabbedSchool = Pick<DeoSchoolRow, 'levels' | 'complianceStatus'>;

function inTab(school: TabbedSchool, tab: SchoolTab): boolean {
  switch (tab) {
    case 'All':
      return true;
    case 'Primary':
      return school.levels.includes('PRIMARY');
    case 'Secondary':
      return school.levels.includes('SECONDARY');
    default:
      return school.complianceStatus === tab;
  }
}

/** Schools Management tabs (portal-web lib/deo-dashboard.ts keeps the same
 * rules). A school with both levels is in both. */
export function filterSchoolsByTab<T extends TabbedSchool>(schools: readonly T[], tab: SchoolTab): T[] {
  return schools.filter((school) => inTab(school, tab));
}

export function schoolTabCounts(schools: readonly TabbedSchool[]): Record<SchoolTab, number> {
  return Object.fromEntries(
    SCHOOL_TABS.map((tab) => [tab, schools.filter((school) => inTab(school, tab)).length]),
  ) as Record<SchoolTab, number>;
}
