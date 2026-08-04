import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';
import { installOutboxTriggers } from './010-create-sync-outbox';

/** Reusable, weighted assessment definitions a teacher sets up per class+
 * subject — desktop mirror of Prisma's AssessmentTemplate. Writable by the
 * teacher who owns the class/subject; synced up via the standard outbox
 * mechanism, validated server-side in desktop-sync-applier.ts. */
export const createAssessmentTemplatesTable: Migration = {
  version: 16,
  name: 'create-assessment-templates-table',
  up(db: SqliteDatabase): void {
    db.exec(`
      CREATE TABLE assessment_templates (
        id TEXT PRIMARY KEY,
        classId TEXT NOT NULL REFERENCES classes (id),
        subjectId TEXT NOT NULL REFERENCES subjects (id),
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        totalMarks REAL NOT NULL,
        weight REAL,
        date TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE INDEX idx_assessment_templates_scope ON assessment_templates (classId, subjectId);
    `);
    installOutboxTriggers(db, ['assessment_templates']);
  },
};
