import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/** Mirrors the backend TimetableEntry model. Academic-year scope is reached
 * through classes; term, lifecycle status, and standalone bell periods do not
 * exist in the authoritative backend schema. */
export const createTimetableManagementTables: Migration = {
  version: 7,
  name: 'create-timetable-management-tables',
  up(db: SqliteDatabase): void {
    db.exec(`
      CREATE TABLE timetable_entries (
        id TEXT PRIMARY KEY,
        institutionId TEXT NOT NULL REFERENCES institutions (id) ON DELETE CASCADE,
        classId TEXT NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
        subjectId TEXT REFERENCES subjects (id) ON DELETE SET NULL,
        staffId TEXT REFERENCES staff (id) ON DELETE SET NULL,
        dayOfWeek TEXT NOT NULL CHECK (dayOfWeek IN (
          'MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'
        )),
        startTime TEXT NOT NULL,
        endTime TEXT NOT NULL,
        room TEXT,
        isBreak INTEGER NOT NULL DEFAULT 0,
        assignmentId TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        lastModifiedBy TEXT,
        deviceId TEXT,
        CHECK (startTime GLOB '[0-2][0-9]:[0-5][0-9]'),
        CHECK (endTime GLOB '[0-2][0-9]:[0-5][0-9]'),
        CHECK (endTime > startTime),
        UNIQUE (classId, dayOfWeek, startTime)
      );
      CREATE INDEX idx_timetable_institution ON timetable_entries (institutionId);
      CREATE INDEX idx_timetable_class_day_time ON timetable_entries (classId, dayOfWeek, startTime);
      CREATE INDEX idx_timetable_staff_day_time ON timetable_entries (staffId, dayOfWeek, startTime, endTime);
      CREATE INDEX idx_timetable_subject_day ON timetable_entries (subjectId, dayOfWeek);
      CREATE INDEX idx_timetable_updated ON timetable_entries (updatedAt);
      CREATE INDEX idx_timetable_assignment ON timetable_entries (assignmentId);
    `);
  },
  down(db: SqliteDatabase): void {
    db.exec('DROP TABLE timetable_entries;');
  },
};

