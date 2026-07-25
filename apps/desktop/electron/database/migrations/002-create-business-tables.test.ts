import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MigrationService } from '../services/MigrationService';
import { TableNames } from '../schema/tableNames';
import { createTestDatabase, type TestDatabase } from '../testing/createTestDatabase';
import { migrations } from './registry';

describe('002-create-business-tables', () => {
  let test: TestDatabase;

  beforeEach(() => {
    test = createTestDatabase();
    new MigrationService(test.db.raw, migrations).migrateToLatest();
  });

  afterEach(() => {
    test.cleanup();
  });

  it('creates every business table', () => {
    const names = (
      test.db.raw
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as Array<{ name: string }>
    ).map((row) => row.name);
    for (const table of [
      TableNames.institutions,
      TableNames.users,
      TableNames.userOrganizations,
      TableNames.academicYears,
      TableNames.classes,
      TableNames.students,
      TableNames.attendance,
    ]) {
      expect(names).toContain(table);
    }
  });

  it('creates the documented business indexes', () => {
    const indexes = (
      test.db.raw
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
        .all() as Array<{ name: string }>
    ).map((row) => row.name);
    for (const idx of [
      'idx_students_institutionId',
      'idx_students_admission',
      'idx_classes_institutionId',
      'idx_classes_academicYearId',
      'idx_academic_years_institutionId',
      'idx_academic_years_isCurrent',
      'idx_user_organizations_userId',
      'idx_attendance_date',
      'idx_attendance_class_date',
    ]) {
      expect(indexes).toContain(idx);
    }
  });

  it('enforces the unique admission-number-per-institution index', () => {
    const now = '2026-01-01T00:00:00Z';
    const insert = test.db.raw.prepare(
      `INSERT INTO ${TableNames.students}
       (id, institutionId, firstName, lastName, admissionNumber, dateOfBirth, gender, isActive, version, updatedAt)
       VALUES (?, 'inst-1', 'A', 'B', 'ADM-1', '2015-01-01', 'MALE', 1, 1, ?)`,
    );
    expect(() => insert.run('s1', now)).not.toThrow();
    expect(() => insert.run('s2', now)).toThrow();
  });

  it('down() removes every business table (rollback through 002)', () => {
    const service = new MigrationService(test.db.raw, migrations);
    service.rollbackLast(); // 007 timetable management
    service.rollbackLast(); // 006 provisioning metadata
    service.rollbackLast(); // 005 — teacher management
    service.rollbackLast(); // 004 — student management
    service.rollbackLast(); // 003 — academic foundation
    service.rollbackLast(); // 002 — business tables
    const names = (
      test.db.raw
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as Array<{ name: string }>
    ).map((row) => row.name);
    expect(names).not.toContain(TableNames.students);
    expect(names).not.toContain(TableNames.institutions);
    // Platform tables from 001 survive.
    expect(names).toContain(TableNames.devices);
  });
});
