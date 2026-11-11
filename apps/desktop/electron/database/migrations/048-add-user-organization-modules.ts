import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/** School office users: which modules an INSTITUTION_STAFF membership may use
 * (a JSON array of module ids, never NULL) and their job title. `user_organizations`
 * is pull-only, so no outbox triggers are touched; the values arrive on the next
 * pull. */
export const addUserOrganizationModules: Migration = {
  version: 48,
  name: 'add-user-organization-modules',
  up(db: SqliteDatabase): void {
    db.exec(`ALTER TABLE user_organizations ADD COLUMN modules TEXT NOT NULL DEFAULT '[]'`);
    db.exec(`ALTER TABLE user_organizations ADD COLUMN title TEXT`);
  },
  down(db: SqliteDatabase): void {
    db.exec(`ALTER TABLE user_organizations DROP COLUMN title`);
    db.exec(`ALTER TABLE user_organizations DROP COLUMN modules`);
  },
};
