import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/** County Students page (docs/superpowers/specs/2026-10-17-county-students-design.md):
 * term averages (performance labels and year averages; the server ships the
 * current and most recently ended year only), and each student's photo and
 * national ID. term_averages is pull-only: no outbox triggers. A full resync
 * is forced so devices already in the field receive the new data now. */
export const addCountyStudentsData: Migration = {
  version: 35,
  name: 'add-county-students-data',
  up(db: SqliteDatabase): void {
    db.exec(`
      CREATE TABLE term_averages (
        id TEXT PRIMARY KEY,
        studentId TEXT NOT NULL,
        subjectId TEXT NOT NULL,
        termId TEXT NOT NULL,
        classId TEXT NOT NULL,
        percentage REAL NOT NULL,
        calculatedAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE INDEX idx_term_averages_student ON term_averages (studentId, calculatedAt);
      ALTER TABLE students ADD COLUMN nationalId TEXT;
      ALTER TABLE students ADD COLUMN photoUrl TEXT;
    `);
    // Same as migration 029: a null lastFullResyncAt makes the next sync cycle a full resync.
    const cols = db.prepare(`PRAGMA table_info("sync_metadata")`).all() as { name: string }[];
    if (cols.some((c) => c.name === 'lastFullResyncAt')) {
      db.exec(`UPDATE sync_metadata SET lastFullResyncAt = NULL`);
    }
  },
};
