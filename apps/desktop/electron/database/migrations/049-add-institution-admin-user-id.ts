import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/** One institution_admin row per membership, not per person: a School Admin
 * of two schools used to collide on the user id and keep only one school.
 * The server now sends the membership id as `id` and the person as `userId`.
 * Rows from an older server keep `id` = user id with `userId` NULL, so readers
 * use COALESCE(userId, id). `institution_admin` is pull-only (no outbox
 * triggers), and the roster is pruned on every pull, so the old rows give way
 * to the new ones on the next sync. */
export const addInstitutionAdminUserId: Migration = {
  version: 49,
  name: 'add-institution-admin-user-id',
  up(db: SqliteDatabase): void {
    db.exec(`ALTER TABLE institution_admin ADD COLUMN userId TEXT`);
  },
  down(db: SqliteDatabase): void {
    db.exec(`ALTER TABLE institution_admin DROP COLUMN userId`);
  },
};
