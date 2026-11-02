import type { ReportCardPayloadV1 } from './report-cards';

/** Stage 5: a transferred-in child's prior record, matched once by the
 * receiving school's admin (server: /transfer-carry-overs). */

export interface PendingCarryOver {
  id: string;
  studentId: string;
  studentName: string;
  fromInstitutionName: string;
  createdAt: string;
}

export type CarryOverMatching = {
  periods: Record<string, string | null>;
  subjects: Record<string, string | null>;
};

export interface CarryOverPreview {
  id: string;
  status: 'PENDING' | 'SAVED';
  student: { id: string; firstName: string; lastName: string };
  fromInstitutionName: string;
  sourcePeriods: { id: string; name: string; termName: string }[];
  sourceSubjects: { id: string; name: string; code: string }[];
  targetPeriods: { id: string; name: string; termName: string }[];
  targetSubjects: { id: string; name: string; code: string }[];
  suggestion: CarryOverMatching;
  saved: CarryOverMatching | null;
}

export interface SaveCarryOverIpcRequest {
  carryOverId: string;
  periods: { sourceGradingPeriodId: string; targetGradingPeriodId: string | null }[];
  subjects: { sourceSubjectId: string; targetSubjectId: string | null }[];
}

/** The rows of a prior-record matching as the server takes them (a review's
 * `matching` and a saved draft): every source once, targets or null. */
export interface TransferMatchingRows {
  periods: { sourceGradingPeriodId: string; targetGradingPeriodId: string | null }[];
  subjects: { sourceSubjectId: string; targetSubjectId: string | null }[];
}

/** Save (replace) the matching draft of a receiving school's own PENDING request. */
export interface TransferMatchingDraftRequest extends TransferMatchingRows {
  transferId: string;
}

/** What the receiving school's admin reviews before approving a transfer
 * (server: GET /student-transfers/:id/record-preview). Online only. */
export interface TransferRecordPreview {
  transferId: string;
  initiatedBy: 'ORIGIN_SCHOOL' | 'RECEIVING_SCHOOL';
  fromInstitutionName: string;
  reason: string;
  requestedAt: string;
  student: { id: string; firstName: string; lastName: string };
  currentGradeLevel: string;
  currentClassName: string;
  reportCards: {
    gradingPeriodId: string;
    gradingPeriodName: string;
    version: number;
    payload: ReportCardPayloadV1;
  }[];
  attendance: {
    gradingPeriodName: string;
    present: number;
    absent: number;
    late: number;
    excused: number;
    sick: number;
  }[];
  matching: {
    sourcePeriods: { id: string; name: string; termName: string }[];
    sourceSubjects: { id: string; name: string; code: string }[];
    targetPeriods: { id: string; name: string; termName: string }[];
    targetSubjects: { id: string; name: string; code: string }[];
    suggestion: CarryOverMatching;
  };
  sourceCells: { subjectId: string; gradingPeriodId: string }[];
  forwardedCount: number;
  draft: TransferMatchingRows | null;
}

/** One student's carried mark in a grading period and subject (local data):
 * the teacher's grade grid shows it read-only. */
export interface CarriedGradeCell {
  studentId: string;
  percentage: number;
  sourceSchoolName: string;
}

/** The grade grid's view of one period and subject: carried marks (read-only)
 * and the students whose pending matching blocks the period (read-only too —
 * the grade guard refuses their marks there until the matching is saved). */
export interface CarriedGradesForPeriodResult {
  carried: CarriedGradeCell[];
  pendingStudentIds: string[];
}

export interface CarriedGradesForPeriodRequest {
  gradingPeriodId: string;
  subjectId: string;
}
