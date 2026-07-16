/**
 * Domain models for the Phase 2 platform tables. Timestamps are ISO-8601 UTC
 * strings (project convention — serializable across IPC as-is). Raw SQLite
 * rows never leave the data layer; these models are what callers see.
 */

export const SYNC_STATUSES = ['never', 'idle', 'syncing', 'failed'] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

export const SYNC_OPERATION_TYPES = ['create', 'update', 'delete'] as const;
export type SyncOperationType = (typeof SYNC_OPERATION_TYPES)[number];

export const SYNC_QUEUE_STATUSES = ['pending', 'in_flight', 'completed', 'failed'] as const;
export type SyncQueueStatus = (typeof SYNC_QUEUE_STATUSES)[number];

export const AUDIT_CATEGORIES = ['application', 'database', 'sync', 'security'] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export interface Device {
  id: string;
  deviceName: string;
  platform: string;
  osVersion: string;
  appVersion: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppSetting {
  id: string;
  key: string;
  value: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface SyncMetadata {
  id: 'singleton';
  lastSyncAt: string | null;
  schemaVersion: number;
  databaseVersion: number;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SyncQueueItem {
  id: string;
  entityType: string;
  entityId: string;
  operationType: SyncOperationType;
  payload: unknown;
  retryCount: number;
  status: SyncQueueStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SyncError {
  id: string;
  operationId: string | null;
  message: string;
  stack: string | null;
  retryCount: number;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  category: AuditCategory;
  event: string;
  details: unknown;
  createdAt: string;
}
