import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

export const addSyncRetryAndDeltaColumns: Migration = {
  version: 13,
  name: 'add-sync-retry-and-delta-columns',
  up(db: SqliteDatabase): void {
    db.exec(`
      ALTER TABLE sync_queue ADD COLUMN nextAttemptAt TEXT;
      ALTER TABLE sync_queue ADD COLUMN deadLetter INTEGER NOT NULL DEFAULT 0 CHECK (deadLetter IN (0, 1));
      ALTER TABLE sync_metadata ADD COLUMN lastDeltaAt TEXT;
      ALTER TABLE sync_metadata ADD COLUMN lastFullResyncAt TEXT;
    `);
  },
};
