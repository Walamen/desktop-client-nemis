import { IpcChannels } from '@nemis-desktop/types';
import type { TransferApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const transferApi: TransferApi = {
  create: (request) => invoke(IpcChannels.TRANSFER_CREATE, request),
  review: (request) => invoke(IpcChannels.TRANSFER_REVIEW, request),
  cancel: (id) => invoke(IpcChannels.TRANSFER_CANCEL, id),
};
