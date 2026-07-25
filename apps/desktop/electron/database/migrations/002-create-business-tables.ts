import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/**
 * Business tables. Created empty and populated only by authenticated
 * provisioning and later synchronization.
 *
 * Conventions (same as 001): TEXT UUID PKs, ISO-8601 UTC TEXT timestamps,
 * booleans stored as INTEGER 0/1. Every row carries sync/conflict metadata
 * (version, updatedAt, lastModifiedBy, deviceId) so the sync phase never has
 * to alter these tables; those columns are unused by any logic this phase.
 *
 * Indexes:
 * - idx_students_institutionId       — students filtered/counted by school.
 * - idx_students_admission           — UNIQUE (institutionId, admissionNumber): dedup + existsByAdmissionNumber.
 * - idx_classes_institutionId        — classes filtered/counted by school.
 * - idx_classes_academicYearId       — classes filtered by academic year.
 * - idx_academic_years_institutionId — academic years filtered by school.
 * - idx_academic_years_isCurrent     — "the current year" lookup.
 * - idx_user_organizations_userId    — a user's roles.
 * - idx_attendance_date              — "today's attendance" summary.
 * - idx_attendance_class_date        — attendance by class and date.
 */
export const createBusinessTables: Migration = {
  version: 2,
  name: 'create-business-tables',

  up(db: SqliteDatabase): void {
    db.exec(`
      CREATE TABLE institutions (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        ownership TEXT NOT NULL,
        countyId TEXT NOT NULL,
        districtId TEXT,
        approvalStatus TEXT NOT NULL,
        street TEXT,
        communityTown TEXT,
        latitude REAL,
        longitude REAL,
        rejectionReason TEXT,
        profile TEXT,
        version INTEGER NOT NULL,
        updatedAt TEXT NOT NULL,
        lastModifiedBy TEXT,
        deviceId TEXT
      );

      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        firstName TEXT NOT NULL,
        middleName TEXT,
        lastName TEXT NOT NULL,
        email TEXT NOT NULL,
        isActive INTEGER NOT NULL DEFAULT 1,
        version INTEGER NOT NULL,
        updatedAt TEXT NOT NULL,
        lastModifiedBy TEXT,
        deviceId TEXT
      );

      CREATE TABLE user_organizations (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        institutionId TEXT,
        countyId TEXT,
        districtId TEXT,
        isActive INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX idx_user_organizations_userId ON user_organizations (userId);

      CREATE TABLE academic_years (
        id TEXT PRIMARY KEY,
        institutionId TEXT NOT NULL,
        code TEXT NOT NULL,
        startDate TEXT NOT NULL,
        endDate TEXT NOT NULL,
        isCurrent INTEGER NOT NULL DEFAULT 0,
        version INTEGER NOT NULL,
        updatedAt TEXT NOT NULL,
        lastModifiedBy TEXT,
        deviceId TEXT
      );
      CREATE INDEX idx_academic_years_institutionId ON academic_years (institutionId);
      CREATE INDEX idx_academic_years_isCurrent ON academic_years (isCurrent);

      CREATE TABLE classes (
        id TEXT PRIMARY KEY,
        institutionId TEXT NOT NULL,
        academicYearId TEXT NOT NULL,
        name TEXT NOT NULL,
        gradeLevel TEXT NOT NULL,
        capacity INTEGER,
        isActive INTEGER NOT NULL DEFAULT 1,
        version INTEGER NOT NULL,
        updatedAt TEXT NOT NULL,
        lastModifiedBy TEXT,
        deviceId TEXT
      );
      CREATE INDEX idx_classes_institutionId ON classes (institutionId);
      CREATE INDEX idx_classes_academicYearId ON classes (academicYearId);

      CREATE TABLE students (
        id TEXT PRIMARY KEY,
        institutionId TEXT NOT NULL,
        firstName TEXT NOT NULL,
        middleName TEXT,
        lastName TEXT NOT NULL,
        admissionNumber TEXT NOT NULL,
        dateOfBirth TEXT NOT NULL,
        gender TEXT NOT NULL,
        gradeLevel TEXT,
        isActive INTEGER NOT NULL DEFAULT 1,
        version INTEGER NOT NULL,
        updatedAt TEXT NOT NULL,
        lastModifiedBy TEXT,
        deviceId TEXT
      );
      CREATE INDEX idx_students_institutionId ON students (institutionId);
      CREATE UNIQUE INDEX idx_students_admission ON students (institutionId, admissionNumber);

      CREATE TABLE attendance (
        id TEXT PRIMARY KEY,
        studentId TEXT NOT NULL,
        classId TEXT NOT NULL,
        subjectId TEXT,
        date TEXT NOT NULL,
        status TEXT NOT NULL,
        recordedBy TEXT,
        version INTEGER NOT NULL,
        updatedAt TEXT NOT NULL,
        lastModifiedBy TEXT,
        deviceId TEXT
      );
      CREATE INDEX idx_attendance_date ON attendance (date);
      CREATE INDEX idx_attendance_class_date ON attendance (classId, date);
    `);
  },

  down(db: SqliteDatabase): void {
    db.exec(`
      DROP TABLE attendance;
      DROP TABLE students;
      DROP TABLE classes;
      DROP TABLE academic_years;
      DROP TABLE user_organizations;
      DROP TABLE users;
      DROP TABLE institutions;
    `);
  },
};
