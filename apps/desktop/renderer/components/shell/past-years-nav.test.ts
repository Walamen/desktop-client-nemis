import { describe, expect, it } from 'vitest';
import { SystemRole, type DesktopPortalRole } from '@nemis-desktop/types';
import { sidebarConfigs } from './sidebarConfig';
import { resolvePageTitle } from './page-titles';

function pastYearsItem(role: DesktopPortalRole) {
  return sidebarConfigs[role].navGroups.flatMap((g) => g.items).find((i) => i.name === 'Past years');
}

describe('Past years navigation', () => {
  it('is present for school admins and teachers, pointing at their own portal', () => {
    expect(pastYearsItem(SystemRole.INSTITUTION_ADMIN)?.href).toBe('/government/school-admin/past-years');
    expect(pastYearsItem(SystemRole.TEACHER)?.href).toBe('/government/teacher/past-years');
  });

  it('is absent for DEO, county and ministry', () => {
    expect(pastYearsItem(SystemRole.DEO)).toBeUndefined();
    expect(pastYearsItem(SystemRole.COUNTY_ADMIN)).toBeUndefined();
    expect(pastYearsItem(SystemRole.MINISTRY_ADMIN)).toBeUndefined();
  });

  it('titles the pages from the sidebar entry', () => {
    expect(resolvePageTitle('/government/teacher/past-years', SystemRole.TEACHER).title).toBe('Past years');
    expect(resolvePageTitle('/government/school-admin/past-years', SystemRole.INSTITUTION_ADMIN).title).toBe('Past years');
  });
});
