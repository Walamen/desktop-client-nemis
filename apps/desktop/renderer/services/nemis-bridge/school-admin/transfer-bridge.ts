import type {
  OnlineCommandResult,
  RemoteRecordRef,
  TransferCreateRequest,
  TransferReviewRequest,
} from '@nemis-desktop/types';
import { api } from '../api';

export const transferBridge = {
  createTransfer: (request: TransferCreateRequest): Promise<OnlineCommandResult<RemoteRecordRef>> =>
    api().transfer.create(request),
  reviewTransfer: (request: TransferReviewRequest): Promise<OnlineCommandResult<RemoteRecordRef>> =>
    api().transfer.review(request),
  cancelTransfer: (id: string): Promise<OnlineCommandResult<RemoteRecordRef>> =>
    api().transfer.cancel(id),
};
