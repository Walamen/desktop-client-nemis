import { describe, expect, it } from 'vitest';
import { resolvePageTitle } from './page-titles';

describe('resolvePageTitle', () => {
  it('resolves the dashboard root', () => {
    expect(resolvePageTitle('/government/school-admin')).toEqual({
      title: 'Dashboard Overview',
      segments: ['School Admin'],
    });
  });
  it('builds a breadcrumb trail for nested routes', () => {
    const r = resolvePageTitle('/government/school-admin/academic-grading/windows');
    expect(r.title).toBe('Grade Windows');
    expect(r.segments).toEqual(['School Admin', 'Academic Grading', 'Windows']);
  });
});
