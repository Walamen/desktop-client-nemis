import { describe, expect, it } from 'vitest';
import type { CountyStudentDetail, StudentAcademicRecord, StudentYearRecord } from '@nemis-desktop/types';
import { mergeStudentRecord, outcomeLabel } from './student-record-merge';

const localYear = (extra: Partial<StudentYearRecord> = {}): StudentYearRecord => ({
  academicYearId: 'y-25', academicYearName: '2025/2026', academicYearStartDate: '2025-09-01', isCurrentYear: true,
  institutionId: 'sch-a', institutionName: 'Alpha School', className: '5A', gradeLevel: 'GRADE_5',
  outcome: null, average: null, attendanceRate: 75, otherCounty: false, ...extra,
});

const local = (studentId: string, years: StudentYearRecord[], transfers: CountyStudentDetail['transfers'] = []): CountyStudentDetail => ({
  student: {
    id: studentId, firstName: 'Ada', middleName: null, lastName: 'Kollie', nemisId: null, nationalId: null, photoUrl: null,
    dateOfBirth: '2014-01-01', gender: 'FEMALE', gradeLevel: 'GRADE_5', isActive: true, admissionDate: null,
    phoneNumber: null, email: null, address: null,
  },
  institution: { id: 'sch-a', name: 'Alpha School', districtName: null, countyName: null },
  currentEnrollment: null, guardians: [], years, transfers,
});

const remoteYear = (extra: Partial<StudentAcademicRecord['years'][number]> = {}): StudentAcademicRecord['years'][number] => ({
  academicYearId: 'y-25', academicYearName: '2025/2026', academicYearStartDate: '2025-09-01', isCurrentYear: true,
  institutionId: 'sch-a', institutionName: 'Alpha School', countyName: 'Grand Bassa', className: '5A', gradeLevel: 'GRADE_5',
  outcome: null, nextGradeLevel: null, average: 66, ...extra,
});

const transfer = (id: string, date: string) => ({
  id, date, fromInstitutionName: 'X', toInstitutionName: 'Y', status: 'COMPLETED', reason: 'r', reviewedByName: null, reviewedAt: null,
});

const LOCAL_IDS = new Set(['sch-a']);

describe('mergeStudentRecord', () => {
  it('keeps one row per year and school; local wins; blank local fields are filled', () => {
    const merged = mergeStudentRecord('s-1', local('s-1', [localYear()]), { years: [remoteYear()], transfers: [] }, LOCAL_IDS);
    expect(merged.years).toHaveLength(1);
    expect(merged.years[0]).toMatchObject({ attendanceRate: 75, average: 66, otherCounty: false });
  });

  it('marks remote-only years at non-local schools as Other county', () => {
    const merged = mergeStudentRecord(
      's-1',
      local('s-1', [localYear()]),
      {
        years: [remoteYear({ academicYearId: 'y-24', academicYearName: '2024/2025', academicYearStartDate: '2024-09-01',
          isCurrentYear: false, institutionId: 'sch-far', institutionName: 'Kakata El.', outcome: 'PROMOTED', average: 71 })],
        transfers: [],
      },
      LOCAL_IDS,
    );
    expect(merged.years[1]).toMatchObject({ institutionName: 'Kakata El.', otherCounty: true, attendanceRate: null, outcome: 'PROMOTED', average: 71 });
  });

  it('never merges a record into a different student', () => {
    const base = local('s-2', [localYear()]);
    const merged = mergeStudentRecord('s-1', base, { years: [remoteYear({ institutionId: 'sch-far' })], transfers: [transfer('t-9', '2025-01-01')] }, LOCAL_IDS);
    expect(merged).toEqual({ years: base.years, transfers: base.transfers });
  });

  it('orders years and transfers newest first', () => {
    const merged = mergeStudentRecord(
      's-1',
      local('s-1', [localYear({ academicYearId: 'y-23', academicYearStartDate: '2023-09-01' })], [transfer('t-1', '2024-01-01')]),
      { years: [remoteYear({ institutionId: 'sch-far' })], transfers: [transfer('t-1', '2024-01-01'), transfer('t-2', '2025-08-20')] },
      LOCAL_IDS,
    );
    expect(merged.years.map((y) => y.academicYearStartDate)).toEqual(['2025-09-01', '2023-09-01']);
    expect(merged.transfers.map((t) => t.id)).toEqual(['t-2', 't-1']);
  });

  it('returns the local record when there is no remote record', () => {
    const base = local('s-1', [localYear()]);
    expect(mergeStudentRecord('s-1', base, null, LOCAL_IDS)).toEqual({ years: base.years, transfers: base.transfers });
  });
});

describe('outcomeLabel', () => {
  it('stamped, In progress, Not recorded', () => {
    expect(outcomeLabel(localYear({ outcome: 'PROMOTED' }))).toBe('Promoted');
    expect(outcomeLabel(localYear({ outcome: 'RETAINED' }))).toBe('Retained');
    expect(outcomeLabel(localYear({ outcome: 'GRADUATED' }))).toBe('Graduated');
    expect(outcomeLabel(localYear({ outcome: null, isCurrentYear: true }))).toBe('In progress');
    expect(outcomeLabel(localYear({ outcome: null, isCurrentYear: false }))).toBe('Not recorded');
  });
});
