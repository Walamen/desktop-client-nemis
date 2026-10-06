import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/** Students sign in by NEMIS ID and may have no email (server commit
 * 1a71a00c), so `users.email` may be NULL. SQLite cannot drop NOT NULL in
 * place, so `users` is rebuilt — the repo's first table rebuild.
 *
 * Foreign keys are ON and `user_organizations.userId REFERENCES users (id)
 * ON DELETE CASCADE`: dropping `users` while role rows point at it would
 * delete every one of them. So the role rows are parked in a table with no
 * foreign key, `user_organizations` is dropped before `users` (nothing
 * references `users` by then), and `user_organizations` is recreated exactly
 * as migration 002 defined it. `users` has no indexes or outbox triggers to
 * recreate. MigrationService runs this inside one transaction, so a failure
 * at any step rolls the whole rebuild back. Irreversible: a NULL email cannot
 * go back under NOT NULL. */
export const makeUserEmailNullable: Migration = {
  version: 30,
  name: 'make-user-email-nullable',
  up(db: SqliteDatabase): void {
    db.exec(`
      CREATE TABLE users_new (
        id TEXT PRIMARY KEY,
        firstName TEXT NOT NULL,
        middleName TEXT,
        lastName TEXT NOT NULL,
        email TEXT,
        isActive INTEGER NOT NULL DEFAULT 1,
        version INTEGER NOT NULL,
        updatedAt TEXT NOT NULL,
        lastModifiedBy TEXT,
        deviceId TEXT
      );
      INSERT INTO users_new
        (id, firstName, middleName, lastName, email, isActive, version, updatedAt, lastModifiedBy, deviceId)
      SELECT id, firstName, middleName, lastName, email, isActive, version, updatedAt, lastModifiedBy, deviceId
      FROM users;

      CREATE TABLE user_organizations_hold (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        role TEXT NOT NULL,
        institutionId TEXT,
        countyId TEXT,
        districtId TEXT,
        isActive INTEGER NOT NULL
      );
      INSERT INTO user_organizations_hold
        (id, userId, role, institutionId, countyId, districtId, isActive)
      SELECT id, userId, role, institutionId, countyId, districtId, isActive
      FROM user_organizations;

      DROP TABLE user_organizations;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;

      CREATE TABLE user_organizations (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        institutionId TEXT,
        countyId TEXT,
        districtId TEXT,
        isActive INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX idx_user_organizations_userId ON user_organizations (userId);
      INSERT INTO user_organizations
        (id, userId, role, institutionId, countyId, districtId, isActive)
      SELECT id, userId, role, institutionId, countyId, districtId, isActive
      FROM user_organizations_hold;
      DROP TABLE user_organizations_hold;
    `);
  },
};
