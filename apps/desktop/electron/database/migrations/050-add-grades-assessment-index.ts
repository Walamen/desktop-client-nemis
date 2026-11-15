import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/** DEO Teacher Monitoring asks, for each current-term assessment, whether it
 * has any grade. Without this index every lookup scans all grades. */
export const addGradesAssessmentIndex: Migration = {
  version: 50,
  name: 'add-grades-assessment-index',
  up(db: SqliteDatabase): void {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_grades_assessment ON grades (assessmentId)`);
  },
  down(db: SqliteDatabase): void {
    db.exec(`DROP INDEX IF EXISTS idx_grades_assessment`);
  },
};
