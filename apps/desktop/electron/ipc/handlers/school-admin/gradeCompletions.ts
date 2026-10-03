import { IpcChannels } from '@nemis-desktop/types';
import type { GradeCompletionService } from '@app/data/services/GradeCompletionService';
import type { IpcHandle } from '@app/ipc/registrar';
import {
  assertDiscardGradeCompletionArgs,
  assertGradeCompletionCohortArgs,
  assertSaveGradeCompletionsArgs,
} from '@app/security/validateIpc';

/** End-of-year outcomes (NEMIS ID desktop parity, Stage 5). Both channels are
 * local: the cohort is read from SQLite and decisions are saved as pending
 * grade_completions rows, pushed later by their own sync path. */
export function registerGradeCompletionHandlers(
  handle: IpcHandle,
  service: GradeCompletionService,
): void {
  handle(IpcChannels.GRADE_COMPLETION_COHORT, assertGradeCompletionCohortArgs, (academicYearId, gradeLevel) =>
    service.getCohort(academicYearId, gradeLevel),
  );
  handle(IpcChannels.GRADE_COMPLETION_SAVE, assertSaveGradeCompletionsArgs, (request) =>
    service.save(request),
  );
  handle(IpcChannels.GRADE_COMPLETION_DISCARD, assertDiscardGradeCompletionArgs, (academicYearId, studentId) =>
    service.discard(academicYearId, studentId),
  );
}
