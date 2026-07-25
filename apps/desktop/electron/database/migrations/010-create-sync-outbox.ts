import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

const MUTABLE_TABLES = [
  'academic_years',
  'terms',
  'classes',
  'subjects',
  'class_subjects',
  'students',
  'guardians',
  'student_guardians',
  'enrollments',
  'attendance',
  'staff',
  'subject_teachers',
  'class_teachers',
  'class_subject_teachers',
  'timetable_entries',
] as const;

export const createSyncOutbox: Migration = {
  version: 10,
  name: 'create-sync-outbox',
  up(db: SqliteDatabase): void {
    db.exec(`
      CREATE TABLE sync_runtime (
        id TEXT PRIMARY KEY CHECK (id = 'singleton'),
        captureEnabled INTEGER NOT NULL DEFAULT 1 CHECK (captureEnabled IN (0, 1))
      );
      INSERT INTO sync_runtime (id, captureEnabled) VALUES ('singleton', 1);

      CREATE TABLE sync_conflicts (
        id TEXT PRIMARY KEY,
        operationId TEXT REFERENCES sync_queue (id) ON DELETE SET NULL,
        entityType TEXT NOT NULL,
        entityId TEXT NOT NULL,
        operationType TEXT NOT NULL
          CHECK (operationType IN ('create', 'update', 'delete')),
        localPayload TEXT,
        remotePayload TEXT,
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'unresolved'
          CHECK (status IN ('unresolved', 'keep_local', 'accept_remote', 'merged')),
        createdAt TEXT NOT NULL,
        resolvedAt TEXT
      );
      CREATE INDEX idx_sync_conflicts_status_createdAt
        ON sync_conflicts (status, createdAt);
      CREATE INDEX idx_sync_conflicts_entity
        ON sync_conflicts (entityType, entityId);
    `);

    installOutboxTriggers(db, MUTABLE_TABLES);
  },
};

export function installOutboxTriggers(
  db: SqliteDatabase,
  tables: readonly string[],
): void {
    for (const table of tables) {
      const columns = db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[];
      const newJson = jsonObject('NEW', columns.map((column) => column.name));
      const oldJson = jsonObject('OLD', columns.map((column) => column.name));
      for (const [action, operation, row, payload] of [
        ['insert', 'create', 'NEW', `json_object('record',${newJson})`],
        ['update', 'update', 'NEW', `json_object('base',${oldJson},'record',${newJson})`],
        ['delete', 'delete', 'OLD', `json_object('base',${oldJson})`],
      ] as const) {
        db.exec(`
          CREATE TRIGGER outbox_${table}_${action}
          AFTER ${action.toUpperCase()} ON "${table}"
          WHEN (SELECT captureEnabled FROM sync_runtime WHERE id = 'singleton') = 1
          BEGIN
            INSERT INTO sync_queue
              (id, entityType, entityId, operationType, payload, retryCount, status, createdAt, updatedAt)
            VALUES
              (lower(hex(randomblob(16))), '${table}', ${row}.id, '${operation}', ${payload},
               0, 'pending', strftime('%Y-%m-%dT%H:%M:%fZ','now'),
               strftime('%Y-%m-%dT%H:%M:%fZ','now'));
          END;
        `);
      }
    }
}

function jsonObject(alias: 'NEW' | 'OLD', columns: readonly string[]): string {
  return `json_object(${columns
    .flatMap((column) => [`'${column}'`, `${alias}."${column}"`])
    .join(',')})`;
}
