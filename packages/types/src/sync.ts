export interface DesktopSyncOperation {
  operationId: string;
  entityType: string;
  entityId: string;
  operationType: 'create' | 'update' | 'delete';
  payload?: unknown;
}

export interface DesktopSyncOperationResult {
  operationId: string;
  entityType: string;
  entityId: string;
  status: 'accepted' | 'conflict';
  reason?: string;
  remotePayload?: Readonly<Record<string, unknown>> | null;
  /** Set when the server reused an existing record instead of creating one
   *  at `entityId` — the canonical id the local device should adopt. */
  redirectedTo?: string;
  /** Set only for a `students` operation when the server assigned a NEMIS ID
   *  different from what the client sent (a national collision reassignment,
   *  or the server correcting a client that should never have varied from
   *  it) — the value the local row must adopt in place of its own. */
  nemisId?: string;
}

export interface DesktopSyncPushResult {
  processedAt: string;
  results: readonly DesktopSyncOperationResult[];
}

export interface SyncConflictResult {
  id: string;
  operationId: string | null;
  entityType: string;
  entityId: string;
  operationType: 'create' | 'update' | 'delete';
  localPayload: unknown;
  remotePayload: unknown;
  reason: string;
  status: 'unresolved' | 'keep_local' | 'accept_remote' | 'merged' | 'retried';
  source: 'conflict' | 'dead_letter';
  createdAt: string;
  resolvedAt: string | null;
}

export interface ResolveSyncConflictRequest {
  conflictId: string;
  resolution: 'keep_local' | 'accept_remote' | 'retry';
}

export interface DesktopSyncStatus {
  /** Unsynced work across the outbox and every bespoke push path (pending +
   * in flight, excluding failures) — same number as PendingSummary.total. */
  pending: number;
  inFlight: number;
  conflicts: number;
  lastSyncAt: string | null;
  status: 'never' | 'idle' | 'syncing' | 'failed';
  isOnline: boolean;
}

/** Where a piece of unsynced work is recorded on this device. */
export type PendingSource = 'outbox' | 'assignments' | 'grade_completions' | 'fee_reversals';

/** sending = in flight; waiting = goes on the next sync; retrying = backed
 * off until nextAttemptAt; held = waits for an earlier item to sync first. */
export type PendingItemState = 'sending' | 'waiting' | 'retrying' | 'held';

export interface PendingGroupSummary {
  /** `${source}:${entityType}`, e.g. 'outbox:attendance'. */
  groupKey: string;
  source: PendingSource;
  label: string;
  total: number;
  byState: Record<PendingItemState, number>;
  oldestAt: string;
}

export interface PendingRecord {
  /** sync_queue.id for the outbox; the entity's own id for bespoke sources. */
  id: string;
  entityType: string;
  entityId: string;
  operationType: 'create' | 'update' | 'delete';
  label: string;
  state: PendingItemState;
  createdAt: string;
  nextAttemptAt: string | null;
  retryCount: number;
  lastError: string | null;
  payload: unknown;
}

export interface PendingSummary {
  groups: PendingGroupSummary[];
  total: number;
  /** Dead-lettered outbox rows + rejected grade completions. */
  failedCount: number;
  /** True when at least one source could not be read. */
  partial: boolean;
}

export interface ListPendingRecordsRequest {
  groupKey: string;
  limit: number;
  offset: number;
}

export interface ListPendingRecordsResult {
  records: PendingRecord[];
  total: number;
}
