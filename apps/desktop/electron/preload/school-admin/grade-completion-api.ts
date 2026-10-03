import { IpcChannels } from '@nemis-desktop/types';
import type { GradeCompletionApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const gradeCompletionApi: GradeCompletionApi = {
  cohort: (academicYearId, gradeLevel) =>
    invoke(IpcChannels.GRADE_COMPLETION_COHORT, academicYearId, gradeLevel),
  save: (request) => invoke(IpcChannels.GRADE_COMPLETION_SAVE, request),
};
