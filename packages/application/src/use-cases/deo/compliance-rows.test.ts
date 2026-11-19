import { describe, expect, it } from 'vitest';
import { complianceRows, complianceSummary, type ComplianceSchoolInput } from './compliance-rows';

const base: ComplianceSchoolInput = {
  id: 's-1',
  name: 'Alpha',
  code: 'A1',
  principalName: 'Ada Obi',
  approvalStatus: 'APPROVED',
  approvedAt: '2025-02-10T00:00:00.000Z',
  createdAt: '2025-01-05T00:00:00.000Z',
  teachers: { total: 12, awaitingApproval: 0, newestCreatedAt: '2026-09-01T00:00:00.000Z' },
};

const rowOf = (school: ComplianceSchoolInput, type: string) =>
  complianceRows(school).find((r) => r.reportType === type)!;

describe('complianceRows', () => {
  it('returns Registration and Teacher Roster in order', () => {
    const rows = complianceRows(base);
    expect(rows.map((r) => r.id)).toEqual(['s-1:registration', 's-1:teachers']);
    expect(rows.map((r) => r.reportType)).toEqual(['Registration', 'Teacher Roster']);
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
});

describe('complianceSummary', () => {
  it('counts every status', () => {
    const items = complianceRows({
      ...base,
      approvalStatus: null,
      teachers: { total: 0, awaitingApproval: 0, newestCreatedAt: null },
    });
    expect(complianceSummary(items)).toEqual({ total: 2, approved: 0, pending: 0, rejected: 0, missing: 2 });
  });
});
