import {
  IpcChannels,
  type TransferCreateRequest,
  type TransferReviewRequest,
} from '@nemis-desktop/types';
import type { BackendProvisioningGateway } from '@app/provisioning/BackendProvisioningGateway';
import type { IpcHandle } from '@app/ipc/registrar';
import {
  assertSingleIdArg,
  assertTransferCreateArgs,
  assertTransferReviewArgs,
} from '@app/security/validateIpc';
import { runOnline } from './online';

export type TransferGateway = Pick<
  BackendProvisioningGateway,
  'createTransfer' | 'reviewTransfer' | 'cancelTransfer'
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
}
