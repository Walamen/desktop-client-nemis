import { describe, expect, it } from 'vitest';
import type { DeoSchoolRow } from '@nemis-desktop/types';
import { SCHOOL_TABS, filterSchoolsByTab, schoolTabCounts, type SchoolTab } from './deo-schools-views';

const row = (id: string, levels: string[], complianceStatus: DeoSchoolRow['complianceStatus']) =>
  ({ id, levels, complianceStatus }) as DeoSchoolRow;
const rows = [
  row('a', ['PRIMARY'], 'Compliant'),
  row('b', ['PRIMARY', 'SECONDARY'], 'Flagged'),
  row('c', ['SECONDARY'], 'Needs Review'),
  row('d', [], 'Compliant'),
];

describe('school tabs', () => {
  it('lists the tabs in the web order', () => {
    expect(SCHOOL_TABS).toEqual(['All', 'Compliant', 'Needs Review', 'Flagged', 'Primary', 'Secondary']);
  });

  it('counts every tab, a school with both levels in both', () => {
    expect(schoolTabCounts(rows)).toEqual({
      All: 4,
      Compliant: 2,
      'Needs Review': 1,
      Flagged: 1,
      Primary: 2,
      Secondary: 2,
    });
  });

  it('filters by status and by level', () => {
    const ids = (tab: SchoolTab) => filterSchoolsByTab(rows, tab).map((r) => r.id);
    expect(ids('All')).toEqual(['a', 'b', 'c', 'd']);
    expect(ids('Compliant')).toEqual(['a', 'd']);
    expect(ids('Flagged')).toEqual(['b']);
    expect(ids('Primary')).toEqual(['a', 'b']);
    expect(ids('Secondary')).toEqual(['b', 'c']);
  });
});
