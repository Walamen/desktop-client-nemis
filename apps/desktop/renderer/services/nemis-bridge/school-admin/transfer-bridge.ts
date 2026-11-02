import type {
  OnlineCommandResult,
  RemoteRecordRef,
  SchoolSearchResult,
  TransferCreateRequest,
  TransferMatchingDraftRequest,
  TransferRecordPreview,
  TransferReviewRequest,
  TransferReviewResult,
} from '@nemis-desktop/types';
import { api } from '../api';

export const transferBridge = {
  createTransfer: (request: TransferCreateRequest): Promise<OnlineCommandResult<RemoteRecordRef>> =>
    api().transfer.create(request),
  reviewTransfer: (request: TransferReviewRequest): Promise<OnlineCommandResult<TransferReviewResult>> =>
    api().transfer.review(request),
  getRecordPreview: (transferId: string): Promise<TransferRecordPreview> =>
    api().transfer.recordPreview(transferId),
  saveMatchingDraft: (request: TransferMatchingDraftRequest): Promise<OnlineCommandResult<null>> =>
    api().transfer.saveMatchingDraft(request),
  clearMatchingDraft: (transferId: string): Promise<OnlineCommandResult<null>> =>
    api().transfer.clearMatchingDraft(transferId),
  cancelTransfer: (id: string): Promise<OnlineCommandResult<RemoteRecordRef>> =>
    api().transfer.cancel(id),
  searchSchools: (query: string): Promise<SchoolSearchResult[]> =>
    api().transfer.searchSchools(query),
};
