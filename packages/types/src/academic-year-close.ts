import type { GradeLevel } from './enums';
import type { CompletionOutcome } from './grade-completions';

/**
 * Close Academic Year (academic-year lifecycle, Stage 3). Request/response
 * types mirror the server endpoints under /academic-years/:id/close, /reopen
 * and /corrections (apps/Server/src/academic-year-close). Online only,
 * INSTITUTION_ADMIN only.
 */

/** One cell a student owes but that has no published period-level grade. */
export interface CloseMissingCell {
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  gradingPeriodId: string;
  gradingPeriodName: string;
}

/** GET /academic-years/:id/close/readiness */
export interface CloseReadiness {
  unpublishedPeriods: { id: string; name: string }[];
  missingCells: CloseMissingCell[];
  cohort: { present: number; withdrawn: number };
}

export interface FillCellEntry {
  studentId: string;
  subjectId: string;
  gradingPeriodId: string;
  /** Percentage, 0 to 100. */
  score: number;
  /** Non-empty. */
  reason: string;
}

/** POST /academic-years/:id/close/fill-cells */
export interface FillCellsRequest {
  entries: FillCellEntry[];
}

export type CloseCohortKind = 'PRESENT' | 'WITHDRAWN';

export interface PromotionDecisionView {
  outcome: CompletionOutcome;
  nextGradeLevel: GradeLevel | null;
  overrideReason: string | null;
}

export interface PromotionStudent {
  studentId: string;
  name: string;
  nemisId: string;
  classId: string;
  gradeLevel: GradeLevel;
  kind: CloseCohortKind;
  yearlyAverage: number | null;
  /** Null for WITHDRAWN students. */
  suggestion: CompletionOutcome | null;
  decision: PromotionDecisionView | null;
  principalRemark: string | null;
}

/** GET /academic-years/:id/close/promotion */
export interface PromotionOverview {
  passMark: number;
  students: PromotionStudent[];
}

export interface PromotionDecisionInput {
  studentId: string;
  outcome: CompletionOutcome;
  nextGradeLevel: GradeLevel | null;
  /** Required when the outcome differs from the suggestion. */
  overrideReason?: string;
}

/** POST /academic-years/:id/close/promotion */
export interface SavePromotionRequest {
  decisions: PromotionDecisionInput[];
  principalRemarks?: { studentId: string; remark: string }[];
  defaultPrincipalRemark?: string;
}

/** POST /academic-years/:id/close, 409 body when the year cannot close yet. */
export interface CloseBlockers {
  unpublishedPeriods?: { id: string; name: string }[];
  missingCells?: CloseMissingCell[];
  undecidedStudents?: { studentId: string; name: string }[];
}

/** POST /academic-years/:id/reopen */
export interface ReopenYearRequest {
  reason: string;
}

/** POST /academic-years/:id/corrections/grade */
export interface CorrectGradeRequest {
  studentId: string;
  subjectId: string;
  gradingPeriodId: string;
  score: number;
  reason: string;
}

/** POST /academic-years/:id/corrections/outcome */
export interface CorrectOutcomeRequest {
  studentId: string;
  outcome: CompletionOutcome;
  nextGradeLevel: GradeLevel | null;
  reason: string;
}

/** POST /academic-years/:id/corrections/remark */
export interface CorrectRemarkRequest {
  studentId: string;
  remark: string;
  reason: string;
}

export interface ArchiveGradeSummary {
  promoted: number;
  retained: number;
  graduated: number;
}

export interface AcademicYearArchiveSummary {
  present: number;
  withdrawn: number;
  promoted: number;
  retained: number;
  graduated: number;
  byGrade: Partial<Record<GradeLevel, ArchiveGradeSummary>>;
}

/** One close of a year, as pulled onto the device (pull-only). Version
 * increments on every close after a reopen. */
export interface AcademicYearArchive {
  id: string;
  academicYearId: string;
  institutionId: string;
  version: number;
  closedBy: string | null;
  closedAt: string | null;
  summary: AcademicYearArchiveSummary | null;
  reopenedBy: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/** IPC wrappers: the renderer addresses the year in the request body, the
 * main process maps it to the path. */
export interface CloseFillCellsIpcRequest extends FillCellsRequest {
  yearId: string;
}
export interface CloseSavePromotionIpcRequest extends SavePromotionRequest {
  yearId: string;
}
export interface CloseReopenIpcRequest extends ReopenYearRequest {
  yearId: string;
}
export interface CloseCorrectGradeIpcRequest extends CorrectGradeRequest {
  yearId: string;
}
export interface CloseCorrectOutcomeIpcRequest extends CorrectOutcomeRequest {
  yearId: string;
}
export interface CloseCorrectRemarkIpcRequest extends CorrectRemarkRequest {
  yearId: string;
}
