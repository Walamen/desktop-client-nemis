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
    // Force the next sync cycle to be a full resync (DesktopSyncWorker treats a
    // null sync_metadata.lastFullResyncAt as "full resync due"), so stamps and
    // departed-cohort students that already exist on the server arrive now
    // instead of waiting up to 24h for the next scheduled full resync. A no-op
    // on a fresh DB (the singleton row is already null) or if the column is absent.
    const cols = db.prepare(`PRAGMA table_info("sync_metadata")`).all() as { name: string }[];
    if (cols.some((c) => c.name === 'lastFullResyncAt')) {
      db.exec(`UPDATE sync_metadata SET lastFullResyncAt = NULL`);
    }
  },
};
