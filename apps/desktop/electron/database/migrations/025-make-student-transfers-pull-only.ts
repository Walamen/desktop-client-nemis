import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/**
 * Transfers become pull-only (NEMIS ID desktop parity spec, §5.1–5.2). The
 * server's sync applier now refuses every desktop transfer write, because a
 * synced row write bypassed the transfer service entirely: an "approval" marked
 * the row APPROVED without moving the child. Desktops act on transfers through
 * online calls instead, so the generic outbox triggers installed by migration
 * 011 come down — same pattern as migration 019.
 *
 * The four columns are the ones the C3 inbox needs and the snapshot already
 * sends (it ships whole rows). initiatedBy defaults to ORIGIN_SCHOOL, the
 * server's own default, so every pre-existing row reads correctly; the next
 * pull overwrites it with the real value.
 */
export const makeStudentTransfersPullOnly: Migration = {
  version: 25,
  name: 'make-student-transfers-pull-only',
  up(db: SqliteDatabase): void {
    db.exec(`
      DROP TRIGGER IF EXISTS outbox_student_transfers_insert;
      DROP TRIGGER IF EXISTS outbox_student_transfers_update;
      DROP TRIGGER IF EXISTS outbox_student_transfers_delete;

      ALTER TABLE student_transfers ADD COLUMN initiatedBy TEXT NOT NULL DEFAULT 'ORIGIN_SCHOOL';
      ALTER TABLE student_transfers ADD COLUMN lapsesAt TEXT;
      ALTER TABLE student_transfers ADD COLUMN classId TEXT;
      ALTER TABLE student_transfers ADD COLUMN termId TEXT;
    `);
  },
};
