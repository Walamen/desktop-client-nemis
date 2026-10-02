import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';
import { installOutboxTriggers } from './010-create-sync-outbox';

/** Carries the "this child has no NEMIS ID" assertion to the server, which
 * audits it on the student's CREATE (NEMIS ID desktop parity spec §7.5).
 * The students outbox triggers bake their column list in at install time, so
 * they are regenerated — same pattern as migration 024. */
export const addStudentAssertedNoNemisId: Migration = {
  version: 27,
  name: 'add-student-asserted-no-nemis-id',
  up(db: SqliteDatabase): void {
    db.exec(`
      DROP TRIGGER IF EXISTS outbox_students_insert;
      DROP TRIGGER IF EXISTS outbox_students_update;
      DROP TRIGGER IF EXISTS outbox_students_delete;
      ALTER TABLE students ADD COLUMN assertedNoNemisId INTEGER NOT NULL DEFAULT 0;
    `);
    installOutboxTriggers(db, ['students']);
  },
};
