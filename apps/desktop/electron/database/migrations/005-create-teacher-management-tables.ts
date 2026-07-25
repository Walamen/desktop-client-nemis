import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/** Mirrors Prisma Staff, SubjectTeacher, ClassTeacher and
 * ClassSubjectTeacher. Local-only version/device columns are sync metadata. */
export const createTeacherManagementTables: Migration = {
  version: 5,
  name: 'create-teacher-management-tables',
  up(db: SqliteDatabase): void {
    db.exec(`
      CREATE TABLE staff (
        id TEXT PRIMARY KEY,
        institutionId TEXT NOT NULL REFERENCES institutions (id),
        userId TEXT UNIQUE,
        firstName TEXT NOT NULL,
        lastName TEXT NOT NULL,
        middleName TEXT,
        dateOfBirth TEXT NOT NULL,
        gender TEXT NOT NULL,
        nationalId TEXT UNIQUE,
        phoneNumber TEXT NOT NULL,
        email TEXT UNIQUE COLLATE NOCASE,
        address TEXT,
        employeeNumber TEXT NOT NULL,
        position TEXT NOT NULL,
        employmentType TEXT NOT NULL,
        dateOfJoining TEXT NOT NULL,
        dateOfLeaving TEXT,
        qualifications TEXT,
        isActive INTEGER NOT NULL DEFAULT 1,
        photoUrl TEXT,
        approvalStatus TEXT NOT NULL DEFAULT 'PENDING',
        approvedBy TEXT,
        approvedAt TEXT,
        approvalNotes TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        lastModifiedBy TEXT,
        deviceId TEXT,
        UNIQUE (institutionId, employeeNumber)
      );
      CREATE INDEX idx_staff_institution ON staff (institutionId);
      CREATE INDEX idx_staff_position ON staff (position);
      CREATE INDEX idx_staff_name ON staff (lastName, firstName);
      CREATE INDEX idx_staff_employment_active ON staff (employmentType, isActive);
      CREATE INDEX idx_staff_updated ON staff (updatedAt);

      CREATE TABLE subject_teachers (
        id TEXT PRIMARY KEY,
        subjectId TEXT NOT NULL REFERENCES subjects (id),
        staffId TEXT NOT NULL REFERENCES staff (id) ON DELETE CASCADE,
        assignedAt TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        updatedAt TEXT NOT NULL,
        lastModifiedBy TEXT,
        deviceId TEXT,
        UNIQUE (subjectId, staffId)
      );
      CREATE INDEX idx_subject_teachers_subject ON subject_teachers (subjectId);
      CREATE INDEX idx_subject_teachers_staff ON subject_teachers (staffId);

      CREATE TABLE class_teachers (
        id TEXT PRIMARY KEY,
        classId TEXT NOT NULL REFERENCES classes (id),
        staffId TEXT NOT NULL REFERENCES staff (id) ON DELETE CASCADE,
        isClassTeacher INTEGER NOT NULL DEFAULT 0,
        assignedAt TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        updatedAt TEXT NOT NULL,
        lastModifiedBy TEXT,
        deviceId TEXT,
        UNIQUE (classId, staffId)
      );
      CREATE INDEX idx_class_teachers_class ON class_teachers (classId);
      CREATE INDEX idx_class_teachers_staff ON class_teachers (staffId);

      CREATE TABLE class_subject_teachers (
        id TEXT PRIMARY KEY,
        classId TEXT NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
        subjectId TEXT NOT NULL REFERENCES subjects (id) ON DELETE CASCADE,
        staffId TEXT NOT NULL REFERENCES staff (id) ON DELETE CASCADE,
        assignedAt TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        updatedAt TEXT NOT NULL,
        lastModifiedBy TEXT,
        deviceId TEXT,
        UNIQUE (classId, subjectId)
      );
      CREATE INDEX idx_class_subject_teachers_class ON class_subject_teachers (classId);
      CREATE INDEX idx_class_subject_teachers_subject ON class_subject_teachers (subjectId);
      CREATE INDEX idx_class_subject_teachers_staff ON class_subject_teachers (staffId);
    `);
  },
  down(db: SqliteDatabase): void {
    db.exec(`
      DROP TABLE class_subject_teachers;
      DROP TABLE class_teachers;
      DROP TABLE subject_teachers;
      DROP TABLE staff;
    `);
  },
};
