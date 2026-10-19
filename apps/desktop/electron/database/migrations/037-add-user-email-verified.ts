import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/** County Admin users page: whether each login has activated its email. NULL
 * means unknown (an older server, or before the first pull) and is read as
 * "verified". `users` has no outbox triggers, so none are touched and no full
 * resync is forced; the value arrives on the next pull. */
export const addUserEmailVerified: Migration = {
  version: 37,
  name: 'add-user-email-verified',
  up(db: SqliteDatabase): void {
    db.exec(`ALTER TABLE users ADD COLUMN emailVerified INTEGER`);
  },
};
