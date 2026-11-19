import { describe, expect, it } from 'vitest';
import { complianceRows, complianceSummary, type ComplianceSchoolInput } from './compliance-rows';

const base: ComplianceSchoolInput = {
  id: 's-1',
  name: 'Alpha',
  code: 'A1',
  principalName: 'Ada Obi',
  reportMonths: [true, true, true],
  lastSubmissionAt: '2026-11-03T10:00:00.000Z',
  approvalStatus: 'APPROVED',
  approvedAt: '2025-02-10T00:00:00.000Z',
  createdAt: '2025-01-05T00:00:00.000Z',
  teachers: { total: 12, awaitingApproval: 0, newestCreatedAt: '2026-09-01T00:00:00.000Z' },
};

const rowOf = (school: ComplianceSchoolInput, type: string) =>
  complianceRows(school).find((r) => r.reportType === type)!;

describe('complianceRows', () => {
  it('returns Registration, Teacher Roster, Monthly Reports in order', () => {
    const rows = complianceRows(base);
    expect(rows.map((r) => r.id)).toEqual(['s-1:registration', 's-1:teachers', 's-1:monthly-reports']);
    expect(rows.map((r) => r.reportType)).toEqual(['Registration', 'Teacher Roster', 'Monthly Reports']);
    for (const r of rows) {
      expect(r).toMatchObject({ schoolId: 's-1', schoolName: 'Alpha', schoolCode: 'A1' });
    }
  });

  it.each([
    ['APPROVED', 'APPROVED'],
    ['PENDING', 'PENDING'],
    ['UNDER_REVIEW', 'PENDING'],
    ['REJECTED', 'REJECTED'],
    [null, 'MISSING'],
  ])('registration maps approval %s to %s', (approvalStatus, expected) => {
    expect(rowOf({ ...base, approvalStatus }, 'Registration').status).toBe(expected);
  });

  it('registration date falls back to createdAt', () => {
    const row = rowOf({ ...base, approvedAt: null }, 'Registration');
    expect(row.date).toBe(base.createdAt);
    expect(row.period).toBe('January 2025');
    const none = rowOf({ ...base, approvedAt: null, createdAt: null }, 'Registration');
    expect(none.date).toBeNull();
    expect(none.period).toBe('Awaiting submission');
    expect(none.status).toBe('APPROVED');
  });

  it('registration submittedBy falls back to Not recorded', () => {
    expect(rowOf({ ...base, principalName: null }, 'Registration').submittedBy).toBe('Not recorded');
    expect(rowOf(base, 'Registration').submittedBy).toBe('Ada Obi');
  });

  it.each([
    [{ total: 0, awaitingApproval: 0, newestCreatedAt: null }, 'MISSING', 'No teacher records', 'No teacher records have been submitted'],
    [{ total: 1, awaitingApproval: 0, newestCreatedAt: '2026-09-01T00:00:00.000Z' }, 'APPROVED', '1 teacher', 'No teachers awaiting approval'],
    [{ total: 12, awaitingApproval: 3, newestCreatedAt: '2026-09-01T00:00:00.000Z' }, 'PENDING', '12 teachers', '3 of 12 awaiting approval'],
  ])('teacher roster %j', (teachers, status, submittedBy, note) => {
    const row = rowOf({ ...base, teachers }, 'Teacher Roster');
    expect(row).toMatchObject({ status, submittedBy, note });
    expect(row.date).toBe(teachers.total === 0 ? null : teachers.newestCreatedAt);
  });

  it.each([
    [[true, true, true], 'APPROVED', '3/3 months with a submitted report'],
    [[false, true, false], 'PENDING', '1/3 months with a submitted report'],
    [[true, false, true], 'PENDING', '2/3 months with a submitted report'],
    [[false, false, false], 'MISSING', '0/3 months with a submitted report'],
  ])('monthly reports %j', (reportMonths, status, note) => {
    expect(rowOf({ ...base, reportMonths }, 'Monthly Reports')).toMatchObject({
      status,
      note,
      submittedBy: 'School reports',
    });
  });

  it('monthly reports keep the last submission date even when MISSING', () => {
    const row = rowOf(
      { ...base, reportMonths: [false, false, false], lastSubmissionAt: '2026-03-14T00:00:00.000Z' },
      'Monthly Reports',
    );
    expect(row.status).toBe('MISSING');
    expect(row.date).toBe('2026-03-14T00:00:00.000Z');
    expect(row.period).toBe('March 2026');
  });

  it('monthly reports with no submission date show Awaiting submission', () => {
    const row = rowOf({ ...base, lastSubmissionAt: null }, 'Monthly Reports');
    expect(row.date).toBeNull();
    expect(row.period).toBe('Awaiting submission');
  });
});

describe('complianceSummary', () => {
  it('counts every status', () => {
    const items = complianceRows({
      ...base,
      approvalStatus: null,
      reportMonths: [false, false, false],
      teachers: { total: 0, awaitingApproval: 0, newestCreatedAt: null },
    });
    expect(complianceSummary(items)).toEqual({ total: 3, approved: 0, pending: 0, rejected: 0, missing: 3 });
  });
});
