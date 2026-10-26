import type { ReportCardIssueDetail, ReportCardPayloadV1, ReportCardSummary } from '@nemis-desktop/types';

/** Test fixtures shared by the report-card component tests. */
export function payloadFixture(): ReportCardPayloadV1 {
  return {
    schemaVersion: 1,
    kind: 'PERIOD',
    issuedForPeriod: { id: 'gp-2', name: 'Period 2' },
    school: { id: 'sch-1', name: 'Monrovia Central High', principalName: 'Ruth Kollie' },
    student: { id: 'st-1', nemisId: '482915736045', firstName: 'Grace', middleName: null, lastName: 'Toe' },
    class: { id: 'cl-1', name: 'Grade 7A', gradeLevel: 'GRADE_7' },
    academicYear: { id: 'ay-1', name: '2026/2027' },
    terms: [{ id: 't-1', name: 'Term 1', sequence: 1 }],
    columns: [
      { key: 'gp:gp-1', kind: 'PERIOD', label: 'Period 1', termId: 't-1', gradingPeriodId: 'gp-1', periodType: 'REGULAR_PERIOD', code: 'P1', sequence: 1 },
      { key: 'gp:gp-2', kind: 'PERIOD', label: 'Period 2', termId: 't-1', gradingPeriodId: 'gp-2', periodType: 'REGULAR_PERIOD', code: 'P2', sequence: 2 },
      { key: 'term:t-1', kind: 'TERM_AVERAGE', label: 'Term 1', termId: 't-1', gradingPeriodId: null, periodType: null, code: null, sequence: 1 },
      { key: 'year', kind: 'YEARLY_AVERAGE', label: 'Yearly', termId: null, gradingPeriodId: null, periodType: null, code: null, sequence: 99 },
    ],
    subjects: [
      {
        subjectId: 'sub-1',
        name: 'Mathematics',
        code: 'MATH',
        cells: {
          'gp:gp-1': { value: 78.5, source: 'CARRIED', sourceSchoolName: 'Paynesville Academy' },
          'gp:gp-2': { value: null, source: 'LOCAL', sourceSchoolName: null },
          'term:t-1': { value: 78.5, source: 'LOCAL', sourceSchoolName: null },
          year: { value: null, source: 'LOCAL', sourceSchoolName: null },
        },
      },
    ],
    overall: { 'gp:gp-1': 78.5, 'gp:gp-2': null, 'term:t-1': 78.5, year: null },
    attendance: { present: 40, absent: 3, late: 2, excused: 1, sick: 4, carriedDays: 0 },
    passMark: 50,
    outcome: null,
    principalRemark: null,
  };
}

export function summaryFixture(over: Partial<ReportCardSummary> = {}): ReportCardSummary {
  return {
    issueId: 'iss-1',
    reportCardId: 'rc-1',
    studentId: 'st-1',
    academicYearId: 'ay-1',
    academicYearName: '2026/2027',
    classId: 'cl-1',
    className: 'Grade 7A',
    kind: 'PERIOD',
    gradingPeriodName: 'Period 2',
    version: 1,
    status: 'CURRENT',
    issuedAt: '2026-10-01T10:00:00.000Z',
    ...over,
  };
}

export function detailFixture(over: Partial<ReportCardSummary> = {}): ReportCardIssueDetail {
  return { summary: summaryFixture(over), payload: payloadFixture() };
}
