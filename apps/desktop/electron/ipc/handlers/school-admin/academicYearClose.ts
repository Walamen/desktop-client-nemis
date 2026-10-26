import {
  IpcChannels,
  type CloseCorrectGradeIpcRequest,
  type CloseCorrectOutcomeIpcRequest,
  type CloseCorrectRemarkIpcRequest,
  type CloseFillCellsIpcRequest,
  type CloseReopenIpcRequest,
  type CloseSavePromotionIpcRequest,
} from '@nemis-desktop/types';
import type { IpcHandle } from '@app/ipc/registrar';
import type { BackendProvisioningGateway } from '@app/provisioning/BackendProvisioningGateway';
import {
  assertCloseFillCellsArgs,
  assertCloseReopenArgs,
  assertCloseSavePromotionArgs,
  assertCorrectGradeArgs,
  assertCorrectOutcomeArgs,
  assertCorrectRemarkArgs,
  assertNoArgs,
  assertSingleIdArg,
} from '@app/security/validateIpc';
import { runOnline } from './online';

export type AcademicYearCloseGateway = Pick<
  BackendProvisioningGateway,
  | 'getCloseReadiness'
  | 'fillCloseCells'
  | 'getClosePromotion'
  | 'saveClosePromotion'
  | 'closeAcademicYear'
  | 'reopenAcademicYear'
  | 'correctGrade'
  | 'correctOutcome'
  | 'correctRemark'
>;

/** Close Academic Year (lifecycle Stage 3). Online only and INSTITUTION_ADMIN
 * only (authorizeChannel). The server owns every rule; each command forces a
 * pull so local SQLite shows the new year status and report cards. A refused
 * close surfaces as REMOTE_REJECTED with the server message and does not
 * refresh: the renderer re-reads readiness. `countPending` is the existing
 * PendingChangesService total (the close gate: nothing unsynced on this
 * device). */
export function registerAcademicYearCloseHandlers(
  handle: IpcHandle,
  gateway: AcademicYearCloseGateway,
  refresh: () => Promise<boolean>,
  countPending: () => number,
): void {
  handle(IpcChannels.CLOSE_GET_READINESS, assertSingleIdArg, (yearId: string) =>
    gateway.getCloseReadiness(yearId),
  );
  handle(IpcChannels.CLOSE_GET_PROMOTION, assertSingleIdArg, (yearId: string) =>
    gateway.getClosePromotion(yearId),
  );
  handle(IpcChannels.CLOSE_PENDING_CHANGES_COUNT, assertNoArgs, () => countPending());

  handle(IpcChannels.CLOSE_FILL_CELLS, assertCloseFillCellsArgs, ({ yearId, entries }: CloseFillCellsIpcRequest) =>
    runOnline(() => gateway.fillCloseCells(yearId, { entries }), refresh),
  );
  handle(
    IpcChannels.CLOSE_SAVE_PROMOTION,
    assertCloseSavePromotionArgs,
    ({ yearId, ...body }: CloseSavePromotionIpcRequest) =>
      runOnline(() => gateway.saveClosePromotion(yearId, body), refresh),
  );
  handle(IpcChannels.CLOSE_YEAR, assertSingleIdArg, (yearId: string) =>
    runOnline(() => gateway.closeAcademicYear(yearId), refresh),
  );
  handle(IpcChannels.REOPEN_YEAR, assertCloseReopenArgs, ({ yearId, reason }: CloseReopenIpcRequest) =>
    runOnline(() => gateway.reopenAcademicYear(yearId, { reason }), refresh),
  );
  handle(IpcChannels.CORRECT_GRADE, assertCorrectGradeArgs, ({ yearId, ...body }: CloseCorrectGradeIpcRequest) =>
    runOnline(() => gateway.correctGrade(yearId, body), refresh),
  );
  handle(
    IpcChannels.CORRECT_OUTCOME,
    assertCorrectOutcomeArgs,
    ({ yearId, ...body }: CloseCorrectOutcomeIpcRequest) =>
      runOnline(() => gateway.correctOutcome(yearId, body), refresh),
  );
  handle(IpcChannels.CORRECT_REMARK, assertCorrectRemarkArgs, ({ yearId, ...body }: CloseCorrectRemarkIpcRequest) =>
    runOnline(() => gateway.correctRemark(yearId, body), refresh),
  );
}
