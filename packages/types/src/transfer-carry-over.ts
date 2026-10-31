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
