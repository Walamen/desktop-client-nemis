// Keep in step with Nemis/apps/Server/src/common/district/school-standing.spec.ts
import { describe, expect, it } from 'vitest';
import {
  daysBetween,
  schoolStanding,
  worstSeverity,
  type SchoolStandingInput,
} from './school-standing';

const BASE: SchoolStandingInput = {
  records30: 100,
  attended30: 90,
  daysSinceAttendance: 0,
  termRunning: true,
  worstOpenAlert: null,
  activeStudents: 80,
  teachingStaff: 4,
};

type Case = [
  string,
  Partial<SchoolStandingInput>,
  number | null,
  string,
  string,
];

const CASES: Case[] = [
  ['a healthy school', {}, 90, 'Good', 'Compliant'],
  ['exactly 80%', { attended30: 80 }, 80, 'Good', 'Compliant'],
  ['79%', { attended30: 79 }, 79, 'Warning', 'Needs Review'],
  ['exactly 60%', { attended30: 60 }, 60, 'Warning', 'Needs Review'],
  ['59%', { attended30: 59 }, 59, 'Critical', 'Flagged'],
  [
    'no records in the window',
    { records30: 0, attended30: 0 },
    null,
    'No Data',
    'Compliant',
  ],
  [
    'never recorded, in term',
    { records30: 0, attended30: 0, daysSinceAttendance: null },
    null,
    'No Data',
    'Flagged',
  ],
  [
    'never recorded, out of term',
    {
      records30: 0,
      attended30: 0,
      daysSinceAttendance: null,
      termRunning: false,
    },
    null,
    'No Data',
    'Compliant',
  ],
  ['3 days since attendance', { daysSinceAttendance: 3 }, 90, 'Good', 'Compliant'],
  ['4 days since attendance', { daysSinceAttendance: 4 }, 90, 'Good', 'Needs Review'],
  ['7 days since attendance', { daysSinceAttendance: 7 }, 90, 'Good', 'Needs Review'],
  ['8 days since attendance', { daysSinceAttendance: 8 }, 90, 'Good', 'Flagged'],
  [
    '8 days, out of term',
    { daysSinceAttendance: 8, termRunning: false },
    90,
    'Good',
    'Compliant',
  ],
  ['open critical alert', { worstOpenAlert: 'CRITICAL' }, 90, 'Good', 'Flagged'],
  ['open high alert', { worstOpenAlert: 'HIGH' }, 90, 'Good', 'Needs Review'],
  ['open medium alert', { worstOpenAlert: 'MEDIUM' }, 90, 'Good', 'Compliant'],
  ['exactly 40 pupils per teacher', { activeStudents: 160 }, 90, 'Good', 'Compliant'],
  ['over 40 pupils per teacher', { activeStudents: 161 }, 90, 'Good', 'Needs Review'],
  ['pupils and no teachers', { teachingStaff: 0 }, 90, 'Good', 'Needs Review'],
  [
    'no pupils and no teachers',
    { activeStudents: 0, teachingStaff: 0 },
    90,
    'Good',
    'Compliant',
  ],
  [
    'flagged wins over needs review',
    { attended30: 59, worstOpenAlert: 'HIGH' },
    59,
    'Critical',
    'Flagged',
  ],
];

describe('schoolStanding', () => {
  it.each(CASES)('%s', (_name, override, rate, performance, compliance) => {
    expect(schoolStanding({ ...BASE, ...override })).toEqual({
      attendanceRate: rate,
      performanceStatus: performance,
      complianceStatus: compliance,
    });
  });
});

describe('daysBetween', () => {
  it('counts whole calendar days', () => {
    expect(daysBetween('2026-11-13', '2026-11-16')).toBe(3);
    expect(daysBetween('2026-11-16', '2026-11-16')).toBe(0);
  });
});

describe('worstSeverity', () => {
  it('returns the highest severity', () => {
    expect(worstSeverity(['LOW', 'HIGH', 'MEDIUM'])).toBe('HIGH');
    expect(worstSeverity(['MEDIUM', 'CRITICAL'])).toBe('CRITICAL');
  });
  it('returns null for none', () => {
    expect(worstSeverity([])).toBeNull();
  });
  it('ignores an unknown severity', () => {
    expect(worstSeverity(['URGENT', 'LOW'])).toBe('LOW');
    expect(worstSeverity(['URGENT'])).toBeNull();
  });
});
