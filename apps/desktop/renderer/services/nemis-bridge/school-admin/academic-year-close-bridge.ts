import type {
  CloseCorrectGradeIpcRequest,
  CloseCorrectOutcomeIpcRequest,
  CloseCorrectRemarkIpcRequest,
  CloseFillCellsIpcRequest,
  CloseReadiness,
  CloseReopenIpcRequest,
  CloseSavePromotionIpcRequest,
  OnlineCommandResult,
  PromotionOverview,
} from '@nemis-desktop/types';
import { api } from '../api';

/** Close Academic Year (online only). A refused close rejects with the
 * server message; the screen then reloads readiness. */
export const academicYearCloseBridge = {
  getCloseReadiness: (yearId: string): Promise<CloseReadiness> => api().academicYearClose.getReadiness(yearId),
  fillCloseCells: (request: CloseFillCellsIpcRequest): Promise<OnlineCommandResult<null>> =>
    api().academicYearClose.fillCells(request),
  getClosePromotion: (yearId: string): Promise<PromotionOverview> => api().academicYearClose.getPromotion(yearId),
  saveClosePromotion: (request: CloseSavePromotionIpcRequest): Promise<OnlineCommandResult<null>> =>
    api().academicYearClose.savePromotion(request),
  closeYear: (yearId: string): Promise<OnlineCommandResult<null>> => api().academicYearClose.closeYear(yearId),
  reopenYear: (request: CloseReopenIpcRequest): Promise<OnlineCommandResult<null>> =>
    api().academicYearClose.reopenYear(request),
  correctGrade: (request: CloseCorrectGradeIpcRequest): Promise<OnlineCommandResult<null>> =>
    api().academicYearClose.correctGrade(request),
  correctOutcome: (request: CloseCorrectOutcomeIpcRequest): Promise<OnlineCommandResult<null>> =>
    api().academicYearClose.correctOutcome(request),
  correctRemark: (request: CloseCorrectRemarkIpcRequest): Promise<OnlineCommandResult<null>> =>
    api().academicYearClose.correctRemark(request),
  /** Unsynced changes on this device; the close is blocked while above zero. */
  getClosePendingChangesCount: (): Promise<number> => api().academicYearClose.pendingChangesCount(),
};
