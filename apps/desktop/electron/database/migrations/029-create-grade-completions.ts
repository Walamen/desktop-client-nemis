import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/** The school's own grade-completion stamps (NEMIS ID desktop parity spec,
 * Stage 5). Deliberately NO foreign key to `students`: the server also sends
 * stamps for children who left before the sync window and so are not in the
 * snapshot. `syncState`/`syncError` track local writes (`pending` rows exist
 * nowhere else, `rejected` rows await the user); the snapshot importer never
 * overwrites or deletes those. No outbox triggers — stamps push through a
 * dedicated path, not the generic outbox. */
export const createGradeCompletions: Migration = {
  version: 29,
  name: 'create-grade-completions',
  up(db: SqliteDatabase): void {
    db.exec(`
      CREATE TABLE grade_completions (
        id TEXT PRIMARY KEY,
        studentId TEXT NOT NULL,
        institutionId TEXT NOT NULL,
        academicYearId TEXT NOT NULL,
        gradeLevel TEXT NOT NULL,
        outcome TEXT NOT NULL,
        nextGradeLevel TEXT,
        averageAtDecision REAL,
        notes TEXT,
        decidedBy TEXT,
        amendedBy TEXT,
        amendedAt TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        syncState TEXT NOT NULL DEFAULT 'synced' CHECK (syncState IN ('synced','pending','rejected')),
        syncError TEXT,
        UNIQUE (studentId, academicYearId)
      );
      CREATE INDEX idx_grade_completions_student ON grade_completions (studentId);
    `);
  },
};
