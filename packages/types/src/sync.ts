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
  pending: number;
  inFlight: number;
  conflicts: number;
  lastSyncAt: string | null;
  status: 'never' | 'idle' | 'syncing' | 'failed';
  isOnline: boolean;
}
