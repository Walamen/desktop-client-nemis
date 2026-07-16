import type { EnqueueSyncOperationInput, RecordSyncErrorInput } from '../../dto/platform';
import type { SyncError, SyncQueueItem, SyncQueueStatus } from '../../models/platform';

/**
 * Offline-first outbox. Owns sync_errors too — errors only exist in the
 * context of a queue operation (the aggregate); a dedicated error repository
 * can be split out when the sync worker phase needs one.
 */
export interface ISyncQueueRepository {
  enqueue(input: EnqueueSyncOperationInput): SyncQueueItem;
  enqueueMany(inputs: readonly EnqueueSyncOperationInput[]): SyncQueueItem[];
  findById(id: string): SyncQueueItem | null;
  /** Oldest pending first — matches idx_sync_queue_status_createdAt. */
  nextBatch(limit: number): SyncQueueItem[];
  markInFlight(ids: readonly string[]): number;
  markCompleted(ids: readonly string[]): number;
  /** Sets status 'failed' and increments retryCount. */
  markFailed(id: string): SyncQueueItem;
  countByStatus(status: SyncQueueStatus): number;
  /** Deletes completed items older than the given ISO timestamp; returns the count. */
  purgeCompleted(olderThan: string): number;
  recordError(input: RecordSyncErrorInput): SyncError;
  errorsForOperation(operationId: string): SyncError[];
}
