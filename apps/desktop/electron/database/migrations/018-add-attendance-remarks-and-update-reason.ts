import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';
import { installOutboxTriggers } from './010-create-sync-outbox';

/** Subject-scoped teacher attendance needs two more columns: a free-text
 * `remarks` note per student record, and `updateReason` — the audit trail
 * captured when a teacher edits a past (non-today) date's attendance, mirroring
 * the web backend's `updateReason` field. `attendance` already has its outbox
 * triggers installed (migration 010), and those were baked from the column
 * list at that time, so they're dropped and reinstalled here to pick up the
 * two new columns. */
export const addAttendanceRemarksAndUpdateReason: Migration = {
  version: 18,
  name: 'add-attendance-remarks-and-update-reason',
  up(db: SqliteDatabase): void {
    db.exec(`
      ALTER TABLE attendance ADD COLUMN remarks TEXT;
      ALTER TABLE attendance ADD COLUMN updateReason TEXT;
      CREATE INDEX idx_attendance_class_subject_date ON attendance (classId, subjectId, date);

      DROP TRIGGER outbox_attendance_insert;
      DROP TRIGGER outbox_attendance_update;
      DROP TRIGGER outbox_attendance_delete;
    `);
    installOutboxTriggers(db, ['attendance']);
  },
};
