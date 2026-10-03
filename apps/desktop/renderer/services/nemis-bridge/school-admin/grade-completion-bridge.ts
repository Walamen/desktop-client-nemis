import type {
  CohortResult,
  CompletionGuidanceRow,
  DiscardCompletionResult,
  GradeLevel,
  SaveCompletionsRequest,
  SaveCompletionsResult,
} from '@nemis-desktop/types';
import { api } from '../api';

/** End-of-year outcomes: the locally derived cohort and pending decisions. */
export const gradeCompletionBridge = {
  getCohort: (academicYearId: string, gradeLevel: GradeLevel): Promise<CohortResult> =>
    api().gradeCompletion.cohort(academicYearId, gradeLevel),
  save: (request: SaveCompletionsRequest): Promise<SaveCompletionsResult> =>
    api().gradeCompletion.save(request),
  /** Drops a pending or rejected local decision; a synced one is kept. */
  discard: (academicYearId: string, studentId: string): Promise<DiscardCompletionResult> =>
    api().gradeCompletion.discard(academicYearId, studentId),
  /** Online only; rejects when offline (the screen then shows a dash). */
  getGuidance: (academicYearId: string, gradeLevel: GradeLevel): Promise<CompletionGuidanceRow[]> =>
    api().gradeCompletion.guidance(academicYearId, gradeLevel),
};
