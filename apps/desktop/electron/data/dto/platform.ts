import type { AuditCategory, SyncOperationType, SyncStatus } from '../models/platform';

/**
 * Repository input shapes. IDs and createdAt/updatedAt are generated inside
 * repositories — never accepted from callers.
 */

export interface CreateDeviceInput {
  deviceName: string;
  platform: string;
  osVersion: string;
  appVersion: string;
}

export interface UpdateDeviceInput {
  deviceName?: string;
  osVersion?: string;
  appVersion?: string;
}

export interface SetSettingInput {
  key: string;
  value: unknown;
}

export interface UpdateSyncMetadataInput {
  lastSyncAt?: string | null;
  syncStatus?: SyncStatus;
  schemaVersion?: number;
  databaseVersion?: number;
}

export interface EnqueueSyncOperationInput {
  entityType: string;
  entityId: string;
  operationType: SyncOperationType;
  payload?: unknown;
}

export interface RecordSyncErrorInput {
  operationId: string | null;
  message: string;
  stack?: string | null;
  retryCount?: number;
}

export interface AppendAuditEntryInput {
  category: AuditCategory;
  event: string;
  details?: unknown;
}
