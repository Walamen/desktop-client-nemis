import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';
import {
  installTableFreezeTriggers,
  RESOLVERS,
  YEAR_OF_CLASS,
} from './040-create-academic-year-freeze';

/**
 * Migration 040 froze enrollments by their own academicYearId only, so a user
 * write that kept academicYearId on an open year but re-pointed classId at a
 * closed year's class slipped through. The enrolment triggers are regenerated
 * so they also check the class's year (OLD and NEW), mirroring the server's
 * enrollment_freeze_class_year migration. Pulls (captureEnabled = 0) are still
 * let through.
 */
export const enrollmentFreezeClassYear: Migration = {
  version: 41,
  name: 'enrollment-freeze-class-year',
  up(db: SqliteDatabase): void {
    for (const action of ['insert', 'update', 'delete']) {
      db.exec(`DROP TRIGGER IF EXISTS freeze_enrollments_${action}`);
    }
    installTableFreezeTriggers(db, 'enrollments', [RESOLVERS.enrollments!, YEAR_OF_CLASS]);
  },
};
