import type { GradeLevel } from './enums';

/** End-of-year outcome (NEMIS ID desktop parity, Stage 5). Server values of
 * `CompletionOutcome`; GRADUATED carries no next grade. */
export type CompletionOutcome = 'PROMOTED' | 'RETAINED' | 'GRADUATED';

export const COMPLETION_OUTCOMES: readonly CompletionOutcome[] = [
  'PROMOTED',
  'RETAINED',
  'GRADUATED',
];

export type GradeCompletionSyncState = 'synced' | 'pending' | 'rejected';

/** One student of a (year, grade) cohort, with the local stamp if any. */
export interface CohortRow {
  studentId: string;
  firstName: string;
  lastName: string;
  nemisId: string | null;
  outcome: CompletionOutcome | null;
  nextGradeLevel: GradeLevel | null;
  notes: string | null;
  /** null when the student has no local stamp for this year yet. */
  syncState: GradeCompletionSyncState | null;
  syncError: string | null;
}

export interface CohortResult {
  rows: CohortRow[];
  /** Active students of this school at that grade whom the cohort cannot
   * see (no enrolment that year, no stamp) — stated, never listed. */
  unenrolledCount: number;
}

export interface CompletionDecision {
  studentId: string;
  outcome: CompletionOutcome;
  nextGradeLevel?: GradeLevel;
  notes?: string;
}

export interface SaveCompletionsRequest {
  academicYearId: string;
  gradeLevel: GradeLevel;
  decisions: CompletionDecision[];
}

export interface SaveCompletionsResult {
  saved: number;
}

export interface DiscardCompletionResult {
  /** false when there was no pending or rejected local row to drop. */
  discarded: boolean;
}
