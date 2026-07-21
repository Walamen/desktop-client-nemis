import { AcademicYear } from '@nemis-desktop/domain';
import { AcademicYearStatus } from '@nemis-desktop/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TableNames } from '../../../../database/schema/tableNames';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteAcademicYearRepository } from './SqliteAcademicYearRepository';

const ISO = '2026-07-21T00:00:00.000Z';

describe('SqliteAcademicYearRepository', () => {
  let test: TestContext;
  let repo: SqliteAcademicYearRepository;

  beforeEach(() => {
    test = createTestContext();
    repo = new SqliteAcademicYearRepository(test.context);
  });
  afterEach(() => test.cleanup());

  it('findCurrent returns null when none is configured', () => {
    expect(repo.findCurrent()).toBeNull();
  });

  it('findCurrent returns the year flagged isCurrent', () => {
    const insert = test.context.connection.prepare(
      `INSERT INTO ${TableNames.academicYears}
       (id, institutionId, code, startDate, endDate, isCurrent, version, updatedAt)
       VALUES (?, 'inst-1', ?, '2025-09-01', '2026-07-31', ?, 1, '2026-07-20T00:00:00.000Z')`,
    );
    insert.run('ay-old', '2024/2025', 0);
    insert.run('ay-cur', '2025/2026', 1);
    const year = repo.findCurrent();
    expect(year?.id).toBe('ay-cur');
    expect(year?.code.value).toBe('2025/2026');
    expect(year?.isCurrent).toBe(true);
  });

  it('save() round-trips status through an upsert', () => {
    const year = AcademicYear.create({
      id: 'ay-1', institutionId: 'inst-1', code: '2025/2026',
      start: '2025-09-01', end: '2026-07-31', occurredAt: ISO,
    });
    repo.save(year);
    expect(repo.findById('ay-1')?.status).toBe(AcademicYearStatus.ACTIVE);

    year.close('admin', ISO);
    repo.save(year);
    expect(repo.findById('ay-1')?.status).toBe(AcademicYearStatus.CLOSED);
  });

  it('findAll orders by startDate DESC', () => {
    repo.save(
      AcademicYear.create({
        id: 'ay-1', institutionId: 'inst-1', code: '2024/2025',
        start: '2024-09-01', end: '2025-07-31', occurredAt: ISO,
      }),
    );
    repo.save(
      AcademicYear.create({
        id: 'ay-2', institutionId: 'inst-1', code: '2025/2026',
        start: '2025-09-01', end: '2026-07-31', occurredAt: ISO,
      }),
    );
    const years = repo.findAll();
    expect(years.map((y) => y.id)).toEqual(['ay-2', 'ay-1']);
  });

  it('existsByCode scopes to institution and excludes the given id', () => {
    repo.save(
      AcademicYear.create({
        id: 'ay-1', institutionId: 'inst-1', code: '2025/2026',
        start: '2025-09-01', end: '2026-07-31', occurredAt: ISO,
      }),
    );
    expect(repo.existsByCode('inst-1', '2025/2026')).toBe(true);
    expect(repo.existsByCode('inst-1', '2025/2026', 'ay-1')).toBe(false);
    expect(repo.existsByCode('inst-2', '2025/2026')).toBe(false);
  });

  it('findCurrentOthers excludes the given id', () => {
    repo.save(
      AcademicYear.create({
        id: 'ay-1', institutionId: 'inst-1', code: '2024/2025',
        start: '2024-09-01', end: '2025-07-31', isCurrent: true, occurredAt: ISO,
      }),
    );
    repo.save(
      AcademicYear.create({
        id: 'ay-2', institutionId: 'inst-1', code: '2025/2026',
        start: '2025-09-01', end: '2026-07-31', isCurrent: true, occurredAt: ISO,
      }),
    );
    const others = repo.findCurrentOthers('inst-1', 'ay-2');
    expect(others.map((y) => y.id)).toEqual(['ay-1']);
  });

  it('countTerms and countClasses read from their tables', () => {
    repo.save(
      AcademicYear.create({
        id: 'ay-1', institutionId: 'inst-1', code: '2025/2026',
        start: '2025-09-01', end: '2026-07-31', occurredAt: ISO,
      }),
    );
    expect(repo.countTerms('ay-1')).toBe(0);
    expect(repo.countClasses('ay-1')).toBe(0);

    test.context.connection
      .prepare(
        `INSERT INTO ${TableNames.terms} (id, academicYearId, name, startDate, endDate, isCurrent, version, updatedAt)
         VALUES ('t-1', 'ay-1', 'Term 1', '2025-09-01', '2025-12-19', 0, 1, ?)`,
      )
      .run(ISO);
    test.context.connection
      .prepare(
        `INSERT INTO ${TableNames.classes} (id, institutionId, academicYearId, name, gradeLevel, isActive, version, updatedAt)
         VALUES ('c-1', 'inst-1', 'ay-1', 'JSS1-A', 'GRADE_7', 1, 1, ?)`,
      )
      .run(ISO);

    expect(repo.countTerms('ay-1')).toBe(1);
    expect(repo.countClasses('ay-1')).toBe(1);
  });
});
