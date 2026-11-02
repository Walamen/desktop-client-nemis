import {
  IpcChannels,
  type TransferCreateRequest,
  type TransferMatchingDraftRequest,
  type TransferReviewRequest,
} from '@nemis-desktop/types';
import type { BackendProvisioningGateway } from '@app/provisioning/BackendProvisioningGateway';
import type { IpcHandle } from '@app/ipc/registrar';
import {
  assertSchoolSearchArgs,
  assertSingleIdArg,
  assertTransferCreateArgs,
  assertTransferMatchingDraftArgs,
  assertTransferReviewArgs,
} from '@app/security/validateIpc';
import { runOnline } from './online';

export type TransferGateway = Pick<
  BackendProvisioningGateway,
  | 'createTransfer'
  | 'reviewTransfer'
  | 'cancelTransfer'
  | 'searchSchools'
  | 'getTransferRecordPreview'
  | 'saveTransferMatchingDraft'
  | 'clearTransferMatchingDraft'
>;

/** Transfers are pull-only through sync (spec §5.1); every change goes
 * through the server's transfer service here, then a forced pull. */
export function registerTransferHandlers(
  handle: IpcHandle,
  gateway: TransferGateway,
  refresh: () => Promise<boolean>,
): void {
  handle(IpcChannels.TRANSFER_CREATE, assertTransferCreateArgs, (request: TransferCreateRequest) =>
    runOnline(() => gateway.createTransfer(request), refresh),
  );
  handle(IpcChannels.TRANSFER_REVIEW, assertTransferReviewArgs, (request: TransferReviewRequest) =>
    runOnline(() => gateway.reviewTransfer(request), refresh),
  );
  handle(IpcChannels.TRANSFER_CANCEL, assertSingleIdArg, (id: string) =>
    runOnline(() => gateway.cancelTransfer(id), refresh),
  );
  // Record review (online only): the preview is a read, so no refresh; the
  // draft commands change only the request, which the next pull carries.
  handle(IpcChannels.TRANSFER_RECORD_PREVIEW, assertSingleIdArg, (id: string) =>
    gateway.getTransferRecordPreview(id),
  );
  handle(
    IpcChannels.TRANSFER_MATCHING_DRAFT_SAVE,
    assertTransferMatchingDraftArgs,
    ({ transferId, ...body }: TransferMatchingDraftRequest) =>
      runOnline(() => gateway.saveTransferMatchingDraft(transferId, body), refresh),
  );
  handle(IpcChannels.TRANSFER_MATCHING_DRAFT_CLEAR, assertSingleIdArg, (id: string) =>
    runOnline(() => gateway.clearTransferMatchingDraft(id), refresh),
  );
  // Read-only lookup: no refresh, nothing changed.
  handle(IpcChannels.TRANSFER_SEARCH_SCHOOLS, assertSchoolSearchArgs, (query: string) =>
    gateway.searchSchools(query.trim()),
  );
}
