import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/**
 * Platform tables only — no business entities (those arrive with sync in
 * later phases). Conventions: TEXT UUID PKs, ISO-8601 UTC TEXT timestamps.
 *
 * Deliberate deviations from the UUID-PK rule (documented, local-only tables):
 * - sync_metadata uses a fixed 'singleton' PK with a CHECK — it is a
 *   single-row table by design and is never synchronized.
 *
 * Indexes:
 * - idx_app_settings_key            UNIQUE — settings are addressed by key.
 * - idx_sync_queue_status_createdAt — the sync worker polls "oldest pending first".
 * - idx_sync_queue_entity           — lookups/dedup by (entityType, entityId).
 * - idx_sync_errors_operationId     — join errors to their queue operation.
 * - idx_sync_errors_createdAt       — error triage is time-ordered.
 * - idx_audit_log_category_createdAt — audit queries filter by category, newest first.
 */
export const createPlatformTables: Migration = {
  version: 1,
  name: 'create-platform-tables',

  up(db: SqliteDatabase): void {
    db.exec(`
      CREATE TABLE devices (
        id TEXT PRIMARY KEY,
        deviceName TEXT NOT NULL,
        platform TEXT NOT NULL,
        osVersion TEXT NOT NULL,
        appVersion TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE app_settings (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX idx_app_settings_key ON app_settings (key);

      CREATE TABLE sync_metadata (
        id TEXT PRIMARY KEY CHECK (id = 'singleton'),
        lastSyncAt TEXT,
        schemaVersion INTEGER NOT NULL,
        databaseVersion INTEGER NOT NULL,
        syncStatus TEXT NOT NULL DEFAULT 'never'
          CHECK (syncStatus IN ('never', 'idle', 'syncing', 'failed')),
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE sync_queue (
        id TEXT PRIMARY KEY,
        entityType TEXT NOT NULL,
        entityId TEXT NOT NULL,
        operationType TEXT NOT NULL
          CHECK (operationType IN ('create', 'update', 'delete')),
        payload TEXT,
        retryCount INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'in_flight', 'completed', 'failed')),
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE INDEX idx_sync_queue_status_createdAt ON sync_queue (status, createdAt);
      CREATE INDEX idx_sync_queue_entity ON sync_queue (entityType, entityId);

      CREATE TABLE sync_errors (
        id TEXT PRIMARY KEY,
        operationId TEXT REFERENCES sync_queue (id) ON DELETE SET NULL,
        message TEXT NOT NULL,
        stack TEXT,
        retryCount INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL
      );
      CREATE INDEX idx_sync_errors_operationId ON sync_errors (operationId);
      CREATE INDEX idx_sync_errors_createdAt ON sync_errors (createdAt);

      CREATE TABLE audit_log (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL
          CHECK (category IN ('application', 'database', 'sync', 'security')),
        event TEXT NOT NULL,
        details TEXT,
        createdAt TEXT NOT NULL
      );
      CREATE INDEX idx_audit_log_category_createdAt ON audit_log (category, createdAt);
    `);
  },

  down(db: SqliteDatabase): void {
    db.exec(`
      DROP TABLE audit_log;
      DROP TABLE sync_errors;
      DROP TABLE sync_queue;
      DROP TABLE sync_metadata;
      DROP TABLE app_settings;
      DROP TABLE devices;
    `);
  },
};
