import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/** County dashboard (docs/superpowers/specs/2026-10-16-county-dashboard-design.md).
 * `counties` holds the one county a County device administers (header name);
 * read-only, so no outbox triggers, like `districts` (migration 021).
 * `students.createdAt` feeds the 12-month enrollment trend; `isActive` on
 * institutions and districts mirrors the server's active-only counts.
 * Existing rows get the values on the next full resync.
 *
 * Students' outbox triggers are deliberately NOT regenerated:
 * installOutboxTriggers snapshots each table's columns when it runs, so the
 * current triggers keep `createdAt` out of push payloads. It is server-owned
 * and must never be pushed — a future migration that regenerates every
 * trigger (as 026 did) must exclude `students.createdAt`. */
export const addCountyDashboardColumns: Migration = {
  version: 31,
  name: 'add-county-dashboard-columns',
  up(db: SqliteDatabase): void {
    db.exec(`
      CREATE TABLE counties (
        id TEXT PRIMARY KEY,
        code TEXT,
        name TEXT NOT NULL
      );
      ALTER TABLE students ADD COLUMN createdAt TEXT;
      ALTER TABLE institutions ADD COLUMN isActive INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE districts ADD COLUMN isActive INTEGER NOT NULL DEFAULT 1;
    `);
  },
};
