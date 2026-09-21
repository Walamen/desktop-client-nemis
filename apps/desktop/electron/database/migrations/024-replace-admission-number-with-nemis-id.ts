import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';
import { installOutboxTriggers } from './010-create-sync-outbox';

/**
 * admissionNumber was hand-typed per school; nemisId is the permanent national
 * identifier that replaces it (see the Phase A spec in the Nemis repo).
 *
 * Step order is forced by SQLite: a column cannot be dropped while any INDEX or
 * TRIGGER references it. The outbox triggers bake the column list in as a
 * literal at install time, so they must come down and be regenerated — same
 * pattern as migration 019.
 *
 * Existing rows keep nemisId NULL on purpose. Every student already in local
 * SQLite was pulled from the server, which assigned its ID during the server
 * backfill; minting one here would manufacture a value that disagrees with the
 * server. The next pull fills them in.
 */
export const replaceAdmissionNumberWithNemisId: Migration = {
  version: 24,
  name: 'replace-admission-number-with-nemis-id',
  up(db: SqliteDatabase): void {
    db.exec(`
      DROP TRIGGER IF EXISTS outbox_students_insert;
      DROP TRIGGER IF EXISTS outbox_students_update;
      DROP TRIGGER IF EXISTS outbox_students_delete;

      DROP INDEX IF EXISTS idx_students_admission;

      ALTER TABLE students ADD COLUMN nemisId TEXT;
      CREATE UNIQUE INDEX idx_students_nemisId ON students (nemisId);

      ALTER TABLE students DROP COLUMN admissionNumber;
    `);
    installOutboxTriggers(db, ['students']);
  },
  // Deliberately irreversible: dropping admissionNumber destroys its values,
  // so down() cannot restore them. MigrationService.rollbackLast() refuses
  // migrations without a down().
};
