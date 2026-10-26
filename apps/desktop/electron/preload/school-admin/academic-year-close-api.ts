import { IpcChannels } from '@nemis-desktop/types';
import type { AcademicYearCloseApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const academicYearCloseApi: AcademicYearCloseApi = {
  getReadiness: (yearId) => invoke(IpcChannels.CLOSE_GET_READINESS, yearId),
  fillCells: (request) => invoke(IpcChannels.CLOSE_FILL_CELLS, request),
  getPromotion: (yearId) => invoke(IpcChannels.CLOSE_GET_PROMOTION, yearId),
  savePromotion: (request) => invoke(IpcChannels.CLOSE_SAVE_PROMOTION, request),
  closeYear: (yearId) => invoke(IpcChannels.CLOSE_YEAR, yearId),
  reopenYear: (request) => invoke(IpcChannels.REOPEN_YEAR, request),
  correctGrade: (request) => invoke(IpcChannels.CORRECT_GRADE, request),
  correctOutcome: (request) => invoke(IpcChannels.CORRECT_OUTCOME, request),
  correctRemark: (request) => invoke(IpcChannels.CORRECT_REMARK, request),
  pendingChangesCount: () => invoke(IpcChannels.CLOSE_PENDING_CHANGES_COUNT),
};
