import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/** County School detail page (docs/superpowers/specs/2026-10-16-county-schools-design.md):
 * the server's `details` object (establishment, access, building counts,
 * facility flags, photo) as one JSON column — nothing filters on it.
 * Institutions has no outbox triggers. */
export const addInstitutionDetails: Migration = {
  version: 33,
  name: 'add-institution-details',
  up(db: SqliteDatabase): void {
    db.exec(`ALTER TABLE institutions ADD COLUMN details TEXT;`);
  },
};
