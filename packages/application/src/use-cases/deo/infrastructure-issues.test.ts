import { describe, expect, it } from 'vitest';
import type { DistrictInfrastructureRow } from '../../interfaces/deo/district-overview-read-model';
import {
  infrastructureStatus,
  infrastructureSummary,
  mapInfrastructureIssue,
  sortInfrastructureIssues,
} from './infrastructure-issues';

const base: DistrictInfrastructureRow = {
  id: 'a-1',
  title: 'Roof',
  description: 'Leaks',
  severity: 'HIGH',
  institutionId: 's-1',
  schoolName: 'Alpha',
  metadata: {},
  createdAt: '2026-11-01T00:00:00.000Z',
};

describe('infrastructure issue helpers', () => {
  it('normalises status', () => {
    expect(infrastructureStatus({ status: 'UNDER_REVIEW' })).toBe('UNDER_REVIEW');
    expect(infrastructureStatus({ status: 'ESCALATED' })).toBe('ESCALATED');
    expect(infrastructureStatus({ status: 'RESOLVED' })).toBe('OPEN');
    expect(infrastructureStatus(null)).toBe('OPEN');
    expect(infrastructureStatus('x')).toBe('OPEN');
  });

  it('falls back for category and reportedAt', () => {
    const plain = mapInfrastructureIssue(base, 'Buchanan');
    expect(plain.category).toBe('Infrastructure');
    expect(plain.reportedAt).toBe('2026-11-01T00:00:00.000Z');
    expect(plain.schoolId).toBe('s-1');
    expect(plain.schoolName).toBe('Alpha');
    const filed = mapInfrastructureIssue(
      { ...base, metadata: { category: 'Roof', submittedAt: '2026-10-05T09:00:00.000Z' } },
      'Buchanan',
    );
    expect(filed.category).toBe('Roof');
    expect(filed.reportedAt).toBe('2026-10-05T09:00:00.000Z');
    const bad = mapInfrastructureIssue({ ...base, metadata: { submittedAt: 'nope' } }, 'Buchanan');
    expect(bad.reportedAt).toBe('2026-11-01T00:00:00.000Z');
  });

  it('shows the district for a district-only issue', () => {
    const issue = mapInfrastructureIssue({ ...base, institutionId: null, schoolName: null }, 'Buchanan');
    expect(issue.schoolId).toBeNull();
    expect(issue.schoolName).toBe('Buchanan');
  });

  it('sorts by severity, newest, then id', () => {
    const mk = (id: string, severity: string, at: string) =>
      mapInfrastructureIssue({ ...base, id, severity, metadata: { submittedAt: at } }, 'D');
    const sorted = sortInfrastructureIssues([
      mk('b', 'HIGH', '2026-11-02T00:00:00.000Z'),
      mk('c', 'HIGH', '2026-11-03T00:00:00.000Z'),
      mk('z', 'CRITICAL', '2026-10-01T00:00:00.000Z'),
      mk('a', 'HIGH', '2026-11-02T00:00:00.000Z'),
      mk('u', 'weird', '2026-11-09T00:00:00.000Z'),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(['z', 'c', 'a', 'b', 'u']);
  });

  it('summarises', () => {
    const mk = (id: string, severity: string, status: string) =>
      mapInfrastructureIssue({ ...base, id, severity, metadata: { status } }, 'D');
    expect(
      infrastructureSummary([mk('1', 'CRITICAL', 'OPEN'), mk('2', 'HIGH', 'UNDER_REVIEW'), mk('3', 'LOW', 'ESCALATED')]),
    ).toEqual({ totalIssues: 3, critical: 1, open: 2, escalated: 1 });
  });
});
