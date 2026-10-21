import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/** County Audit Trail + Settings (docs/superpowers/specs/2026-10-21-county-audit-settings-design.md):
 * the county audit trail (the County Admin and the county's DEOs and School
 * Admins, last 365 days, actor name and scope resolved by the server) so the
 * page reads offline, and the county row's status and dates for Settings.
 * Pull-only: no outbox triggers. The importer prunes rows older than 365
 * days. A full resync is forced so devices receive the existing history now. */
export const createAuditLogs: Migration = {
  version: 39,
  name: 'create-audit-logs',
  up(db: SqliteDatabase): void {
    db.exec(`
      CREATE TABLE audit_logs (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        action TEXT NOT NULL,
        entityType TEXT NOT NULL,
        entityId TEXT,
        timestamp TEXT NOT NULL,
        actorName TEXT NOT NULL,
        actorScope TEXT NOT NULL
      );
      CREATE INDEX idx_audit_logs_timestamp ON audit_logs (timestamp);
      ALTER TABLE counties ADD COLUMN isActive INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE counties ADD COLUMN createdAt TEXT;
      ALTER TABLE counties ADD COLUMN updatedAt TEXT;
    `);
    // Same as migration 029: a null lastFullResyncAt makes the next sync cycle a full resync.
    const cols = db.prepare(`PRAGMA table_info("sync_metadata")`).all() as { name: string }[];
    if (cols.some((c) => c.name === 'lastFullResyncAt')) {
      db.exec(`UPDATE sync_metadata SET lastFullResyncAt = NULL`);
    }
  },
};
