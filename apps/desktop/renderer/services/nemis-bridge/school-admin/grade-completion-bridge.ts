import type {
  CohortResult,
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
};
