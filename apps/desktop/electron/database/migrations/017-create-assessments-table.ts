import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';
import { installOutboxTriggers } from './010-create-sync-outbox';

/** A single grading period's application of an assessment_templates row —
 * desktop mirror of Prisma's Assessment. `grades.assessmentId` references
 * this table's `id`, not assessment_templates' — see the renderer's
 * materialize-on-save helper in components/academic-grading/assessments.ts.
 * Created directly by the teacher (never by an admin), and never deleted
 * once created — see desktop-sync-applier.ts's assessmentInstance handler. */
export const createAssessmentsTable: Migration = {
  version: 17,
  name: 'create-assessments-table',
  up(db: SqliteDatabase): void {
    db.exec(`
      CREATE TABLE assessments (
        id TEXT PRIMARY KEY,
        templateId TEXT NOT NULL REFERENCES assessment_templates (id),
        classId TEXT NOT NULL REFERENCES classes (id),
        subjectId TEXT NOT NULL REFERENCES subjects (id),
        gradingPeriodId TEXT NOT NULL REFERENCES grading_periods (id),
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        totalMarks REAL NOT NULL,
        weight REAL,
        date TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        UNIQUE(templateId, gradingPeriodId)
      );
      CREATE INDEX idx_assessments_scope ON assessments (classId, subjectId, gradingPeriodId);
    `);
    installOutboxTriggers(db, ['assessments']);
  },
};
