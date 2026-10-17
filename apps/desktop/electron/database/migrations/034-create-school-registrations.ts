import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/** Schools a County Admin saved on this device and the server has not
 * accepted yet (docs/superpowers/specs/2026-10-17-county-school-registration-design.md).
 * Like grade_completions: its own table, never in `institutions` (a full
 * import deletes every snapshot table), no outbox triggers — rows push
 * through SchoolRegistrationSyncService to the web's POST /institutions.
 * `id` becomes the institution's server id. `synced` rows stay: they carry
 * the principal's login for the Principal Login card. */
export const createSchoolRegistrations: Migration = {
  version: 34,
  name: 'create-school-registrations',
  up(db: SqliteDatabase): void {
    db.exec(`
      CREATE TABLE school_registrations (
        id TEXT PRIMARY KEY,
        countyId TEXT NOT NULL,
        createdBy TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('form','bulk')),
        payload TEXT NOT NULL,
        syncState TEXT NOT NULL DEFAULT 'pending' CHECK (syncState IN ('pending','synced','rejected')),
        syncError TEXT,
        principalEmail TEXT,
        principalPassword TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        syncedAt TEXT
      );
      CREATE INDEX idx_school_registrations_user ON school_registrations (createdBy, syncState);
    `);
  },
};
