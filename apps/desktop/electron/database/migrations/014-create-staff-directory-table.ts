import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/** Minimal, non-sensitive staff directory (name/position/photo/contact) —
 * unlike `staff`, provisioned institution-wide for every role including
 * TEACHER (see restrictTeacherSnapshot on the server), so a teacher's device
 * never needs to sync down other staff's nationalId/dateOfBirth/address/
 * qualifications to render "My School"'s staff directory. Read-only: never
 * written locally, so it carries no outbox triggers. */
export const createStaffDirectoryTable: Migration = {
  version: 14,
  name: 'create-staff-directory-table',
  up(db: SqliteDatabase): void {
    db.exec(`
      CREATE TABLE staff_directory (
        id TEXT PRIMARY KEY,
        institutionId TEXT NOT NULL REFERENCES institutions (id),
        firstName TEXT NOT NULL,
        lastName TEXT NOT NULL,
        position TEXT NOT NULL,
        photoUrl TEXT,
        email TEXT,
        phoneNumber TEXT,
        isActive INTEGER NOT NULL DEFAULT 1,
        updatedAt TEXT NOT NULL
      );
      CREATE INDEX idx_staff_directory_institution ON staff_directory (institutionId);
    `);
  },
};
