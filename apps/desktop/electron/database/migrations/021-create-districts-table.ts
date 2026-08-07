import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/** County-scoped reference data (id, name, countyId) for district name
 * lookups — e.g. the County Admin schools list showing which district each
 * institution belongs to. Read-only: never written locally, so it carries no
 * outbox triggers, matching institution_admin (migration 015) and
 * staff_directory (migration 014). */
export const createDistrictsTable: Migration = {
  version: 21,
  name: 'create-districts-table',
  up(db: SqliteDatabase): void {
    db.exec(`
      CREATE TABLE districts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        countyId TEXT NOT NULL
      );
      CREATE INDEX idx_districts_county ON districts (countyId);
    `);
  },
};
