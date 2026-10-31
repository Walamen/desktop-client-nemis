/**
 * Report cards, as the desktop reads them (academic-year lifecycle, Stage 2).
 * `ReportCardPayloadV1` mirrors the server's payload field for field
 * (apps/Server/src/report-cards/report-card-payload.ts); readers never
 * recompute a card, they render the payload of an issue.
 */
export type ReportCardColumnKind = 'PERIOD' | 'TERM_AVERAGE' | 'YEARLY_AVERAGE';
export type ReportCardIssueKind = 'PERIOD' | 'FINAL';
export type ReportCardIssueStatus = 'CURRENT' | 'SUPERSEDED' | 'WITHDRAWN';
export type ReportCardCellSource = 'LOCAL' | 'CARRIED' | 'ADMIN_AT_CLOSE';

export interface ReportCardColumn {
  /** "gp:<gradingPeriodId>" | "term:<termId>" | "year" */
  key: string;
  kind: ReportCardColumnKind;
  /** Grading period name | term name | "Yearly". */
  label: string;
  termId: string | null;
  gradingPeriodId: string | null;
  periodType: 'REGULAR_PERIOD' | 'MIDTERM_EXAM' | 'FINAL_EXAM' | null;
  /** Grading period code. */
  code: string | null;
  /** Order within its term (term columns: term sequence). */
  sequence: number;
}

export interface ReportCardCell {
  value: number | null;
  source: ReportCardCellSource;
  sourceSchoolName: string | null;
}

export interface ReportCardSubject {
  subjectId: string;
  name: string;
  code: string;
  cells: Record<string, ReportCardCell>;
}

export interface ReportCardAttendance {
  present: number;
  absent: number;
  late: number;
  excused: number;
  sick: number;
  carriedDays: number;
}

export interface ReportCardOutcome {
  status: 'PROMOTED' | 'RETAINED' | 'GRADUATED' | 'WITHDRAWN';
  nextGradeLevel: string | null;
  yearlyAverage: number | null;
}

export interface ReportCardPayloadV1 {
  schemaVersion: 1;
  kind: ReportCardIssueKind;
  issuedForPeriod: { id: string; name: string } | null;
  school: { id: string; name: string; principalName: string | null };
  student: { id: string; nemisId: string; firstName: string; middleName: string | null; lastName: string };
  class: { id: string; name: string; gradeLevel: string };
  academicYear: { id: string; name: string };
  terms: { id: string; name: string; sequence: number }[];
  columns: ReportCardColumn[];
  subjects: ReportCardSubject[];
  /** Per column key: mean of the subjects' non-null values, 1 decimal. */
  overall: Record<string, number | null>;
  attendance: ReportCardAttendance;
  passMark: number;
  /** FINAL cards carry the end-of-year outcome; PERIOD cards keep null. */
  outcome: ReportCardOutcome | null;
  /** Null for PERIOD. */
  principalRemark: string | null;
  /** Stage 5: marks from a previous school this year that fill no column
   * here. Shown under that school, never averaged. Absent on older cards. */
  priorSchoolRecord?: { schoolName: string; subjectName: string; periodLabel: string; value: number }[];
}

/** One row of a report card list: an issue plus the names needed to show it. */
export interface ReportCardSummary {
  issueId: string;
  reportCardId: string;
  studentId: string;
  academicYearId: string;
  academicYearName: string;
  classId: string;
  className: string;
  kind: ReportCardIssueKind;
  gradingPeriodName: string | null;
  version: number;
  status: ReportCardIssueStatus;
  issuedAt: string;
}

/** One student's line on a class page: the latest CURRENT issue, or null when
 * every issue of the card has been replaced or withdrawn. */
export interface ReportCardClassEntry {
  student: { id: string; nemisId: string | null; fullName: string };
  latest: ReportCardSummary | null;
}

/** A closed (or reopened) year that holds report cards, with the classes
 * whose cards the caller may open. */
export interface ReportCardArchivedYear {
  academicYearId: string;
  code: string;
  status: 'CLOSED' | 'REOPENED';
  classes: { classId: string; name: string; gradeLevel: string }[];
}

export interface ReportCardIssueDetail {
  summary: ReportCardSummary;
  payload: ReportCardPayloadV1;
}

/** One school's latest close of an academic year, as a district or county
 * officer sees it (pull-only `academic_year_archives`). */
export interface YearClosureRow {
  academicYearId: string;
  yearCode: string;
  institutionId: string;
  schoolName: string;
  status: 'CLOSED' | 'REOPENED';
  closedAt: string | null;
  promoted: number;
  retained: number;
  graduated: number;
}
