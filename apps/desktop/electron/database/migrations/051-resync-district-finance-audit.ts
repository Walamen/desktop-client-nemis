import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/** DEO Finance (docs/superpowers/specs/2026-11-17-deo-finance-design.md):
 * the district snapshot now ships the district's finance audit entries into
 * audit_logs (created by migration 039). A district device runs one full
 * resync so it receives the existing history; other devices are untouched. */
export const resyncDistrictFinanceAudit: Migration = {
  version: 51,
  name: 'resync-district-finance-audit',
  up(db: SqliteDatabase): void {
    db.exec(`
      UPDATE sync_metadata SET lastFullResyncAt = NULL
      WHERE EXISTS (SELECT 1 FROM provisioning_metadata WHERE scopeType = 'DISTRICT')
    `);
  },
};
