import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/** County Districts pages (docs/superpowers/specs/2026-10-16-county-districts-design.md):
 * district code, DEO contact/photo/created fields on users, and school contact
 * and EMIS/official codes. None of these tables has outbox triggers. */
export const addCountyDistrictsColumns: Migration = {
  version: 32,
  name: 'add-county-districts-columns',
  up(db: SqliteDatabase): void {
    db.exec(`
      ALTER TABLE districts ADD COLUMN code TEXT;
      ALTER TABLE users ADD COLUMN phoneNumber TEXT;
      ALTER TABLE users ADD COLUMN lastLoginAt TEXT;
      ALTER TABLE users ADD COLUMN photoUrl TEXT;
      ALTER TABLE users ADD COLUMN createdAt TEXT;
      ALTER TABLE institutions ADD COLUMN contactPhone TEXT;
      ALTER TABLE institutions ADD COLUMN contactPersonPhone TEXT;
      ALTER TABLE institutions ADD COLUMN emisCode TEXT;
      ALTER TABLE institutions ADD COLUMN officialSchoolCode TEXT;
    `);
  },
};
