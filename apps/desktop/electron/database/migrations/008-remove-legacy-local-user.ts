import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/**
 * Removes the pre-provisioning placeholder identity from upgraded installs.
 * Server-provisioned identities are never matched by this migration.
 */
export const removeLegacyLocalUser: Migration = {
  version: 8,
  name: 'remove-legacy-local-user',
  up(db: SqliteDatabase): void {
    db.exec(`
      DELETE FROM user_organizations
      WHERE userId IN (
        SELECT id FROM users WHERE email = 'admin@local.nemis'
      );
      DELETE FROM users WHERE email = 'admin@local.nemis';
    `);
  },
};
