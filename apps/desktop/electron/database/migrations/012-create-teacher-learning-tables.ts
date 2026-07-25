import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';
import { installOutboxTriggers } from './010-create-sync-outbox';

export const createTeacherLearningTables: Migration = {
  version: 12,
  name: 'create-teacher-learning-tables',
  up(db: SqliteDatabase): void {
    db.exec(`
      CREATE TABLE assignments (
        id TEXT PRIMARY KEY, classId TEXT NOT NULL, subjectId TEXT, teacherId TEXT NOT NULL,
        title TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL, description TEXT,
        instructions TEXT, dueDate TEXT NOT NULL, totalMarks REAL, attachmentUrl TEXT,
        attachmentName TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
      );
      CREATE INDEX idx_assignments_teacher ON assignments (teacherId,status,dueDate);
      CREATE INDEX idx_assignments_class ON assignments (classId,subjectId);
      CREATE TABLE assignment_submissions (
        id TEXT PRIMARY KEY, assignmentId TEXT NOT NULL, studentId TEXT NOT NULL,
        status TEXT NOT NULL, submittedAt TEXT, response TEXT, fileUrl TEXT, fileName TEXT,
        grade REAL, feedback TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
        UNIQUE(assignmentId,studentId)
      );
      CREATE INDEX idx_assignment_submissions_assignment ON assignment_submissions (assignmentId,status);
      CREATE TABLE class_resources (
        id TEXT PRIMARY KEY, institutionId TEXT NOT NULL, classId TEXT NOT NULL,
        subjectId TEXT NOT NULL, staffId TEXT NOT NULL, title TEXT NOT NULL,
        description TEXT, type TEXT NOT NULL, fileUrl TEXT, linkUrl TEXT, fileSize INTEGER,
        fileType TEXT, category TEXT NOT NULL, isVisible INTEGER NOT NULL,
        createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
      );
      CREATE INDEX idx_class_resources_class ON class_resources (classId,subjectId);
      CREATE INDEX idx_class_resources_staff ON class_resources (staffId);
    `);
    installOutboxTriggers(db, ['assignments', 'assignment_submissions', 'class_resources']);
  },
};
