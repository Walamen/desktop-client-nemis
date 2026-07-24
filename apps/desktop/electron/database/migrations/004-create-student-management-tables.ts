import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/** Phase 10 student operational data. Mirrors the backend Guardian,
 * StudentGuardian and Enrollment models and preserves sync metadata. */
export const createStudentManagementTables: Migration = {
  version: 4,
  name: 'create-student-management-tables',
  up(db: SqliteDatabase): void {
    db.exec(`
      ALTER TABLE students ADD COLUMN admissionDate TEXT;
      ALTER TABLE students ADD COLUMN phoneNumber TEXT;
      ALTER TABLE students ADD COLUMN email TEXT;
      ALTER TABLE students ADD COLUMN address TEXT;

      CREATE INDEX idx_students_name ON students (lastName, firstName);
      CREATE INDEX idx_students_gender ON students (gender);
      CREATE INDEX idx_students_grade_active ON students (gradeLevel, isActive);

      CREATE TABLE guardians (
        id TEXT PRIMARY KEY,
        firstName TEXT NOT NULL,
        lastName TEXT NOT NULL,
        relationship TEXT NOT NULL,
        phoneNumber TEXT NOT NULL,
        email TEXT,
        address TEXT,
        occupation TEXT,
        isEmergencyContact INTEGER NOT NULL DEFAULT 0,
        version INTEGER NOT NULL,
        updatedAt TEXT NOT NULL,
        lastModifiedBy TEXT,
        deviceId TEXT
      );
      CREATE INDEX idx_guardians_phone ON guardians (phoneNumber);

      CREATE TABLE student_guardians (
        id TEXT PRIMARY KEY,
        studentId TEXT NOT NULL REFERENCES students (id) ON DELETE CASCADE,
        guardianId TEXT NOT NULL REFERENCES guardians (id),
        isPrimary INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL,
        UNIQUE (studentId, guardianId)
      );
      CREATE INDEX idx_student_guardians_student ON student_guardians (studentId);

      CREATE TABLE enrollments (
        id TEXT PRIMARY KEY,
        studentId TEXT NOT NULL REFERENCES students (id),
        classId TEXT NOT NULL REFERENCES classes (id),
        academicYearId TEXT NOT NULL REFERENCES academic_years (id),
        termId TEXT NOT NULL REFERENCES terms (id),
        enrollmentDate TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        version INTEGER NOT NULL,
        updatedAt TEXT NOT NULL,
        lastModifiedBy TEXT,
        deviceId TEXT,
        UNIQUE (studentId, academicYearId, termId)
      );
      CREATE INDEX idx_enrollments_student ON enrollments (studentId);
      CREATE INDEX idx_enrollments_class ON enrollments (classId);
      CREATE INDEX idx_enrollments_year_term ON enrollments (academicYearId, termId);
    `);
  },
  down(db: SqliteDatabase): void {
    db.exec(`
      DROP TABLE enrollments;
      DROP TABLE student_guardians;
      DROP TABLE guardians;
      DROP INDEX idx_students_grade_active;
      DROP INDEX idx_students_gender;
      DROP INDEX idx_students_name;
    `);
  },
};
