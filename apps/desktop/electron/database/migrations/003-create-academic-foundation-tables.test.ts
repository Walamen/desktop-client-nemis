import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MigrationService } from '../services/MigrationService';
import { TableNames } from '../schema/tableNames';
import { createTestDatabase, type TestDatabase } from '../testing/createTestDatabase';
import { migrations } from './registry';

const NOW = '2026-07-21T00:00:00.000Z';

describe('003-create-academic-foundation-tables', () => {
  let test: TestDatabase;

  beforeEach(() => {
    test = createTestDatabase();
    new MigrationService(test.db.raw, migrations).migrateToLatest();
  });

  afterEach(() => {
    test.cleanup();
  });

  it('creates the academic foundation tables', () => {
    const names = (
      test.db.raw
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as Array<{ name: string }>
    ).map((row) => row.name);
    for (const table of [TableNames.terms, TableNames.subjects, TableNames.classSubjects]) {
      expect(names).toContain(table);
    }
  });

  it('adds status to academic_years and section to classes', () => {
    const yearColumns = (
      test.db.raw.prepare('PRAGMA table_info(academic_years)').all() as Array<{ name: string }>
    ).map((c) => c.name);
    expect(yearColumns).toContain('status');
    const classColumns = (
      test.db.raw.prepare('PRAGMA table_info(classes)').all() as Array<{ name: string }>
    ).map((c) => c.name);
    expect(classColumns).toContain('section');
  });

  it('creates the documented indexes', () => {
    const indexes = (
      test.db.raw
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
        .all() as Array<{ name: string }>
    ).map((row) => row.name);
    for (const idx of [
      'idx_academic_years_institution_code',
      'idx_classes_year_name',
      'idx_terms_academicYearId',
      'idx_terms_isCurrent',
      'idx_terms_year_name',
      'idx_subjects_institutionId',
      'idx_subjects_institution_code',
      'idx_class_subjects_pair',
      'idx_class_subjects_subjectId',
    ]) {
      expect(indexes).toContain(idx);
    }
  });

  it('enforces subject-code-per-institution uniqueness', () => {
    const insert = test.db.raw.prepare(
      `INSERT INTO subjects (id, institutionId, name, code, isActive, version, updatedAt)
       VALUES (?, ?, ?, ?, 1, 1, ?)`,
    );
    insert.run('sub-1', 'inst-1', 'Mathematics', 'MATH', NOW);
    expect(() => insert.run('sub-2', 'inst-1', 'Maths again', 'MATH', NOW)).toThrow();
    // same code in a different institution is fine
    insert.run('sub-3', 'inst-2', 'Mathematics', 'MATH', NOW);
  });

  it('enforces term-name-per-year and one-assignment-per-class-subject uniqueness', () => {
    const term = test.db.raw.prepare(
      `INSERT INTO terms (id, academicYearId, name, startDate, endDate, isCurrent, version, updatedAt)
       VALUES (?, ?, ?, ?, ?, 0, 1, ?)`,
    );
    term.run('t-1', 'ay-1', 'Term 1', '2026-09-01', '2026-12-19', NOW);
    expect(() => term.run('t-2', 'ay-1', 'Term 1', '2027-01-05', '2027-04-01', NOW)).toThrow();
    term.run('t-3', 'ay-2', 'Term 1', '2026-09-01', '2026-12-19', NOW);

    const link = test.db.raw.prepare(
      `INSERT INTO class_subjects (id, classId, subjectId, assignedAt, version, updatedAt)
       VALUES (?, ?, ?, ?, 1, ?)`,
    );
    link.run('cs-1', 'class-1', 'sub-1', NOW, NOW);
    expect(() => link.run('cs-2', 'class-1', 'sub-1', NOW, NOW)).toThrow();
  });

  it('rolls back: down() drops the new tables and keeps 002 tables intact', () => {
    const service = new MigrationService(test.db.raw, migrations);
    service.rollbackLast();
    const names = (
      test.db.raw
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as Array<{ name: string }>
    ).map((row) => row.name);
    expect(names).not.toContain(TableNames.terms);
    expect(names).not.toContain(TableNames.subjects);
    expect(names).not.toContain(TableNames.classSubjects);
    expect(names).toContain(TableNames.classes);
  });
});
