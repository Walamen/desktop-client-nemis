import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/**
 * Academic Foundation tables (Phase 9): terms, subjects, class_subjects, plus
 * the columns the backend model carries that Phase 8 omitted (academic year
 * `status`, class `section`) and the uniqueness indexes that mirror backend
 * constraints (year code per institution, class name per year, subject code
 * per institution, term name per year, one subject assignment per class).
 *
 * Conventions (same as 001/002): TEXT UUID PKs, ISO-8601 UTC TEXT timestamps,
 * booleans stored as INTEGER 0/1, sync/conflict metadata columns
 * (version, updatedAt, lastModifiedBy, deviceId) on every row.
 *
 * `down` drops the three new tables and the two indexes added to existing
 * tables. The ALTER TABLE ... ADD COLUMN changes are NOT reverted — SQLite
 * cannot drop columns without a table rebuild, and the columns are harmless
 * on rollback (status defaults to ACTIVE, section stays NULL).
 */
export const createAcademicFoundationTables: Migration = {
  version: 3,
  name: 'create-academic-foundation-tables',

  up(db: SqliteDatabase): void {
    db.exec(`
      ALTER TABLE academic_years ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE';
      ALTER TABLE classes ADD COLUMN section TEXT;

      CREATE UNIQUE INDEX idx_academic_years_institution_code
        ON academic_years (institutionId, code);
      CREATE UNIQUE INDEX idx_classes_year_name
        ON classes (institutionId, academicYearId, name);

      CREATE TABLE terms (
        id TEXT PRIMARY KEY,
        academicYearId TEXT NOT NULL,
        name TEXT NOT NULL,
        startDate TEXT NOT NULL,
        endDate TEXT NOT NULL,
        isCurrent INTEGER NOT NULL DEFAULT 0,
        version INTEGER NOT NULL,
        updatedAt TEXT NOT NULL,
        lastModifiedBy TEXT,
        deviceId TEXT
      );
      CREATE INDEX idx_terms_academicYearId ON terms (academicYearId);
      CREATE INDEX idx_terms_isCurrent ON terms (isCurrent);
      CREATE UNIQUE INDEX idx_terms_year_name ON terms (academicYearId, name);

      CREATE TABLE subjects (
        id TEXT PRIMARY KEY,
        institutionId TEXT NOT NULL,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        description TEXT,
        isActive INTEGER NOT NULL DEFAULT 1,
        version INTEGER NOT NULL,
        updatedAt TEXT NOT NULL,
        lastModifiedBy TEXT,
        deviceId TEXT
      );
      CREATE INDEX idx_subjects_institutionId ON subjects (institutionId);
      CREATE UNIQUE INDEX idx_subjects_institution_code ON subjects (institutionId, code);

      CREATE TABLE class_subjects (
        id TEXT PRIMARY KEY,
        classId TEXT NOT NULL,
        subjectId TEXT NOT NULL,
        assignedAt TEXT NOT NULL,
        version INTEGER NOT NULL,
        updatedAt TEXT NOT NULL,
        lastModifiedBy TEXT,
        deviceId TEXT
      );
      CREATE UNIQUE INDEX idx_class_subjects_pair ON class_subjects (classId, subjectId);
      CREATE INDEX idx_class_subjects_subjectId ON class_subjects (subjectId);
    `);
  },

  down(db: SqliteDatabase): void {
    db.exec(`
      DROP TABLE class_subjects;
      DROP TABLE subjects;
      DROP TABLE terms;
      DROP INDEX idx_classes_year_name;
      DROP INDEX idx_academic_years_institution_code;
    `);
  },
};
