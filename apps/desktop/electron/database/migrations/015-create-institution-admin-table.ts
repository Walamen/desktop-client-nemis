import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/** The institution's current INSTITUTION_ADMIN account (name/photo/email/
 * phone) — 0 or 1 row per institution. "Principal" in the UI is whoever
 * holds this role, not a `staff` row with position=PRINCIPAL (those are
 * different id spaces). Institution-wide and provisioned for every role
 * including TEACHER (see the server's restrictTeacherSnapshot), same
 * reasoning as staff_directory. Read-only: never written locally, so it
 * carries no outbox triggers. */
export const createInstitutionAdminTable: Migration = {
  version: 15,
  name: 'create-institution-admin-table',
  up(db: SqliteDatabase): void {
    db.exec(`
      CREATE TABLE institution_admin (
        id TEXT PRIMARY KEY,
        institutionId TEXT NOT NULL REFERENCES institutions (id),
        firstName TEXT NOT NULL,
        lastName TEXT NOT NULL,
        position TEXT NOT NULL,
        photoUrl TEXT,
        email TEXT,
        phoneNumber TEXT,
        isActive INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX idx_institution_admin_institution ON institution_admin (institutionId);
    `);
  },
};
