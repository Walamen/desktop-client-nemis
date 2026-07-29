import type {
  AppSetting,
  AuditCategory,
  AuditLogEntry,
  Device,
  SyncError,
  SyncMetadata,
  SyncOperationType,
  SyncQueueItem,
  SyncQueueStatus,
  SyncStatus,
} from '../models/platform';
import { parseJsonColumn } from './json';
import type { RowMapper } from './RowMapper';

// Enum-typed columns are narrowed with `as` — the schema's CHECK constraints
// guarantee the stored values; the cast records that guarantee for TypeScript.
//
// Row shapes are `type` aliases (NOT interfaces) on purpose: BaseRepository's
// `TRow extends Record<string, SqlValue>` constraint needs the implicit index
// signature that TypeScript gives type aliases but not interfaces.

export type DeviceRow = {
  id: string;
  deviceName: string;
  platform: string;
  osVersion: string;
  appVersion: string;
  createdAt: string;
  updatedAt: string;
};

export const deviceMapper: RowMapper<DeviceRow, Device> = {
  toModel: (row) => ({ ...row }),
};

export type AppSettingRow = {
  id: string;
  key: string;
  value: string;
  createdAt: string;
  updatedAt: string;
};

export const appSettingMapper: RowMapper<AppSettingRow, AppSetting> = {
  toModel: (row) => ({
    id: row.id,
    key: row.key,
    value: parseJsonColumn(row.value, `app_settings.value (${row.key})`),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }),
};

export type SyncMetadataRow = {
  id: string;
  lastSyncAt: string | null;
  schemaVersion: number;
  databaseVersion: number;
  syncStatus: string;
  createdAt: string;
  updatedAt: string;
};

export const syncMetadataMapper: RowMapper<SyncMetadataRow, SyncMetadata> = {
  toModel: (row) => ({
    id: 'singleton',
    lastSyncAt: row.lastSyncAt,
    schemaVersion: row.schemaVersion,
    databaseVersion: row.databaseVersion,
    syncStatus: row.syncStatus as SyncStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }),
};

export type SyncQueueRow = {
  id: string;
  entityType: string;
  entityId: string;
  operationType: string;
  payload: string | null;
  retryCount: number;
  nextAttemptAt: string | null;
  deadLetter: number;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export const syncQueueMapper: RowMapper<SyncQueueRow, SyncQueueItem> = {
  toModel: (row) => ({
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    operationType: row.operationType as SyncOperationType,
    payload: parseJsonColumn(row.payload, `sync_queue.payload (${row.id})`),
    retryCount: row.retryCount,
    nextAttemptAt: row.nextAttemptAt,
    deadLetter: row.deadLetter === 1,
    status: row.status as SyncQueueStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }),
};

export type SyncErrorRow = {
  id: string;
  operationId: string | null;
  message: string;
  stack: string | null;
  retryCount: number;
  createdAt: string;
};

export const syncErrorMapper: RowMapper<SyncErrorRow, SyncError> = {
  toModel: (row) => ({ ...row }),
};

export type AuditLogRow = {
  id: string;
  category: string;
  event: string;
  details: string | null;
  createdAt: string;
};

export const auditLogMapper: RowMapper<AuditLogRow, AuditLogEntry> = {
  toModel: (row) => ({
    id: row.id,
    category: row.category as AuditCategory,
    event: row.event,
    details: parseJsonColumn(row.details, `audit_log.details (${row.id})`),
    createdAt: row.createdAt,
  }),
};
