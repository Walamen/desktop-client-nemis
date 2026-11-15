import { describe, expect, it } from 'vitest';
import type { DeoAlert, DeoSchoolRow } from '@nemis-desktop/types';
import {
  PAGE_SIZE,
  bannerLine,
  filterAlerts,
  filterPerformance,
  formatLevels,
  greetingFor,
  pageOf,
} from './deo-dashboard-views';

function school(name: string, performanceStatus: DeoSchoolRow['performanceStatus'] = 'Good'): DeoSchoolRow {
  return {
    id: name.toLowerCase(),
    name,
    code: name.slice(0, 2).toUpperCase(),
    levels: [],
    students: 0,
    teachers: 0,
    attendanceRate: null,
    lastSubmissionAt: null,
    performanceStatus,
    complianceStatus: 'Compliant',
    feeCollectionRate: null,
    principalName: null,
    reportMonths: [false, false, false],
  };
}

function alert(id: string, severity: string): DeoAlert {
  return { id, type: 'DATA', severity, title: id, description: '', institutionId: null, createdAt: '2026-11-01T00:00:00.000Z' };
}

describe('filterPerformance', () => {
  const schools = [school('Alpha Academy'), school('Beta School', 'Critical'), school('Gamma alpha', 'Warning')];

  it('returns every school with no search and no status', () => {
    expect(filterPerformance(schools, '', '')).toHaveLength(3);
  });
  it('searches the name without regard to case and ignores surrounding spaces', () => {
    expect(filterPerformance(schools, '  ALPHA ', '').map((s) => s.name)).toEqual(['Alpha Academy', 'Gamma alpha']);
  });
  it('filters by performance status across the whole list', () => {
    expect(filterPerformance(schools, '', 'Critical').map((s) => s.name)).toEqual(['Beta School']);
  });
  it('combines search and status', () => {
    expect(filterPerformance(schools, 'alpha', 'Warning').map((s) => s.name)).toEqual(['Gamma alpha']);
  });
});

describe('pageOf', () => {
  const rows = Array.from({ length: 23 }, (_, i) => i + 1);

  it('uses pages of ten', () => {
    expect(PAGE_SIZE).toBe(10);
    expect(pageOf(rows, 1)).toEqual({ rows: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], page: 1, totalPages: 3, total: 23 });
    expect(pageOf(rows, 3).rows).toEqual([21, 22, 23]);
  });
  it('clamps a page past the end to the last page', () => {
    expect(pageOf(rows, 9)).toMatchObject({ page: 3, rows: [21, 22, 23] });
  });
  it('clamps a page below one to the first page', () => {
    expect(pageOf(rows, 0).page).toBe(1);
  });
  it('reports one empty page for an empty list', () => {
    expect(pageOf([], 4)).toEqual({ rows: [], page: 1, totalPages: 1, total: 0 });
  });
});

describe('filterAlerts', () => {
  const alerts = [alert('a', 'CRITICAL'), alert('b', 'LOW'), alert('c', 'critical')];

  it('returns all alerts for no severity', () => {
    expect(filterAlerts(alerts, '')).toHaveLength(3);
  });
  it('matches the severity without regard to case', () => {
    expect(filterAlerts(alerts, 'CRITICAL').map((a) => a.id)).toEqual(['a', 'c']);
  });
});

describe('greetingFor', () => {
  it.each([
    [0, 'Good morning'],
    [11, 'Good morning'],
    [12, 'Good afternoon'],
    [16, 'Good afternoon'],
    [17, 'Good evening'],
    [23, 'Good evening'],
  ])('hour %i → %s', (hour, expected) => {
    expect(greetingFor(hour)).toBe(expected);
  });
});

describe('bannerLine', () => {
  // Local-time constructor: the same calendar day in every timezone.
  const date = new Date(2026, 10, 14, 12, 0, 0);

  it('joins title, district, county and the full date', () => {
    expect(bannerLine({ title: 'District Education Officer', district: 'Buchanan', county: 'Grand Bassa', date })).toBe(
      'District Education Officer · Buchanan · Grand Bassa · Saturday, November 14, 2026',
    );
  });
  it('leaves out a missing county', () => {
    expect(bannerLine({ title: 'District Education Officer', district: 'Buchanan', county: null, date })).toBe(
      'District Education Officer · Buchanan · Saturday, November 14, 2026',
    );
  });
  it('leaves out both names without printing a placeholder', () => {
    const line = bannerLine({ title: 'District Education Officer', date });
    expect(line).toBe('District Education Officer · Saturday, November 14, 2026');
    expect(line).not.toMatch(/District ·|County|· ·/);
  });
  it('treats a blank name as missing', () => {
    expect(bannerLine({ title: 'District Education Officer', district: '  ', county: '', date })).toBe(
      'District Education Officer · Saturday, November 14, 2026',
    );
  });
});

describe('formatLevels', () => {
  it('title-cases one level', () => {
    expect(formatLevels(['PRIMARY'])).toBe('Primary');
  });
  it('joins several levels', () => {
    expect(formatLevels(['PRIMARY', 'JUNIOR_HIGH'])).toBe('Primary, Junior High');
  });
  it('shows a dash for none', () => {
    expect(formatLevels([])).toBe('—');
  });
});
