import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

export const addProvisioningScope: Migration = {
  version: 9,
  name: 'add-provisioning-scope',
  up(db: SqliteDatabase): void {
    db.exec(`
      ALTER TABLE provisioning_metadata ADD COLUMN role TEXT;
      ALTER TABLE provisioning_metadata ADD COLUMN scopeType TEXT;
      ALTER TABLE provisioning_metadata ADD COLUMN scopeId TEXT;
    `);
    db.exec(`
      UPDATE provisioning_metadata
      SET role = 'INSTITUTION_ADMIN',
          scopeType = 'INSTITUTION',
          scopeId = institutionId
      WHERE scopeId IS NULL AND institutionId IS NOT NULL;
    `);
  },
};
