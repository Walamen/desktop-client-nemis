import { IpcChannels } from '@nemis-desktop/types';
import type { GradeCompletionService } from '@app/data/services/GradeCompletionService';
import type { BackendProvisioningGateway } from '@app/provisioning/BackendProvisioningGateway';
import type { IpcHandle } from '@app/ipc/registrar';
import {
  assertDiscardGradeCompletionArgs,
  assertGradeCompletionCohortArgs,
  assertSaveGradeCompletionsArgs,
} from '@app/security/validateIpc';

export type GradeCompletionGateway = Pick<BackendProvisioningGateway, 'getCompletionGuidance'>;

/** End-of-year outcomes (NEMIS ID desktop parity, Stage 5). Cohort, save and discard are
 * local: the cohort is read from SQLite and decisions are saved as pending
 * grade_completions rows, pushed later by their own sync path. Guidance is the
 * one online read. */
export function registerGradeCompletionHandlers(
  handle: IpcHandle,
  service: GradeCompletionService,
  gateway: GradeCompletionGateway,
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
  // Read-only, online-only guidance averages: no refresh (nothing changed);
  // offline or failed, the channel errors and the screen shows a dash.
  handle(IpcChannels.GRADE_COMPLETION_GUIDANCE, assertGradeCompletionCohortArgs, (academicYearId, gradeLevel) =>
    gateway.getCompletionGuidance(academicYearId, gradeLevel),
  );
}
