import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/** DEO Messages (docs/superpowers/specs/2026-11-17-deo-messages-notifications-design.md):
 * the district snapshot now ships the DEO's own direct conversations and
 * messages (tables from migration 038) and the county's County Admin, so a
 * district device runs one full resync to receive them. Other devices are
 * untouched. */
export const resyncDistrictMessages: Migration = {
  version: 52,
  name: 'resync-district-messages',
  up(db: SqliteDatabase): void {
    db.exec(`
      UPDATE sync_metadata SET lastFullResyncAt = NULL
      WHERE EXISTS (SELECT 1 FROM provisioning_metadata WHERE scopeType = 'DISTRICT')
    `);
  },
};
