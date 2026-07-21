import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TableNames } from '../../../../database/schema/tableNames';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteAcademicYearRepository } from './SqliteAcademicYearRepository';

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
});
