import { describe, expect, it } from 'vitest';
import { SystemRole } from '@nemis-desktop/types';
import { resolvePageTitle } from './page-titles';

describe('resolvePageTitle', () => {
  it('resolves the school-admin dashboard root via the explicit override', () => {
    expect(resolvePageTitle('/government/school-admin', SystemRole.INSTITUTION_ADMIN)).toEqual({
      title: 'Dashboard Overview',
      segments: ['School Admin'],
    });
  });

  it('builds a breadcrumb trail for nested school-admin routes', () => {
    const r = resolvePageTitle('/government/school-admin/academic-grading/windows', SystemRole.INSTITUTION_ADMIN);
    expect(r.title).toBe('Grade Windows');
    expect(r.segments).toEqual(['School Admin', 'Academic Grading', 'Windows']);
  });

  it('resolves a county page title from the sidebar config, with no explicit override', () => {
    const r = resolvePageTitle('/government/county/students', SystemRole.COUNTY_ADMIN);
    expect(r.title).toBe('Students');
    expect(r.segments).toEqual(['County', 'Students']);
  });

  it('falls back to title-casing the last path segment for an unmapped nested path', () => {
    // Not itself a sidebar item and not in any explicit override — exercises the
    // third resolution branch (neither of the previous two tests do: "students" and
    // "fee-rules" are both real top-level sidebar items, matched by the second branch).
    const r = resolvePageTitle('/government/county/districts/detail', SystemRole.COUNTY_ADMIN);
    expect(r.title).toBe('Detail');
    expect(r.segments).toEqual(['County', 'Districts', 'Detail']);
  });
});
