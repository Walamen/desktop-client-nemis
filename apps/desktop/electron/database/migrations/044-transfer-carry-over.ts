import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

const CAPTURE_ON = `(SELECT captureEnabled FROM sync_runtime WHERE id = 'singleton') = 1`;

/** Refuses the row the trigger sees (NEW) when it would fill a carried cell,
 * or a period before the child joined while the matching is still pending —
 * the server's nemis_assert_not_carried_cell, mirrored so an offline teacher
 * cannot even queue such a mark. */
const GUARD = `
  SELECT RAISE(ABORT, 'TRANSFER_CARRIED_CELL')
  WHERE NEW.gradingPeriodId IS NOT NULL AND EXISTS (
    SELECT 1 FROM carried_grades c
    WHERE c.studentId = NEW.studentId
      AND c.targetSubjectId = NEW.subjectId
      AND c.targetGradingPeriodId = NEW.gradingPeriodId
  );
  SELECT RAISE(ABORT, 'TRANSFER_MATCH_PENDING')
  WHERE NEW.gradingPeriodId IS NOT NULL AND EXISTS (
    SELECT 1 FROM transfer_carry_overs t
    JOIN grading_periods p ON p.id = NEW.gradingPeriodId
    WHERE t.studentId = NEW.studentId
      AND t.academicYearId = p.academicYearId
      AND t.status = 'PENDING'
      AND julianday(p.endDate) < julianday(t.enrolledAt)
  );`;

/**
 * Academic-year lifecycle, Stage 5 (mid-year transfer carry-over).
 *
 * 1. transfer_carry_overs and carried_grades: pull-only (no outbox, no
 *    freeze triggers — the server freezes them with the receiving year).
 * 2. A capture-on guard on grades: a carried cell is read-only, and while a
 *    matching is PENDING no mark goes into a period that ended before the
 *    child joined. Pulls (captureEnabled = 0) still land.
 */
export const transferCarryOver: Migration = {
  version: 44,
  name: 'transfer-carry-over',
  up(db: SqliteDatabase): void {
    db.exec(`
      CREATE TABLE transfer_carry_overs (
        id TEXT PRIMARY KEY,
        studentId TEXT NOT NULL,
        institutionId TEXT NOT NULL,
        academicYearId TEXT NOT NULL,
        fromInstitutionName TEXT NOT NULL,
        enrolledAt TEXT NOT NULL,
        status TEXT NOT NULL,
        createdAt TEXT,
        updatedAt TEXT
      );
      CREATE INDEX idx_transfer_carry_overs_student ON transfer_carry_overs (studentId);
      CREATE TABLE carried_grades (
        id TEXT PRIMARY KEY,
        carryOverId TEXT NOT NULL,
        studentId TEXT NOT NULL,
        sourceSchoolName TEXT NOT NULL,
        targetSubjectId TEXT,
        targetGradingPeriodId TEXT,
        percentage REAL NOT NULL,
        createdAt TEXT,
        updatedAt TEXT
      );
      CREATE INDEX idx_carried_grades_cell ON carried_grades (studentId, targetSubjectId, targetGradingPeriodId);

      CREATE TRIGGER guard_carried_cells_insert
      BEFORE INSERT ON grades
      WHEN ${CAPTURE_ON}
      BEGIN${GUARD}
      END;

      CREATE TRIGGER guard_carried_cells_update
      BEFORE UPDATE OF studentId, subjectId, gradingPeriodId, marksObtained, percentage ON grades
      WHEN ${CAPTURE_ON}
      BEGIN${GUARD}
      END;
    `);

    // Same as migrations 029/039/042/043: a null lastFullResyncAt forces a full resync.
    const cols = db.prepare(`PRAGMA table_info("sync_metadata")`).all() as { name: string }[];
    if (cols.some((c) => c.name === 'lastFullResyncAt')) {
      db.exec(`UPDATE sync_metadata SET lastFullResyncAt = NULL`);
    }
  },
};
