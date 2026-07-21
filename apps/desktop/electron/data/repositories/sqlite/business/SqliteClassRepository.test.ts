import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TableNames } from '../../../../database/schema/tableNames';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteClassRepository } from './SqliteClassRepository';

describe('SqliteClassRepository', () => {
  let test: TestContext;
  let repo: SqliteClassRepository;

  beforeEach(() => {
    test = createTestContext();
    repo = new SqliteClassRepository(test.context);
  });
  afterEach(() => test.cleanup());

  it('countAll is 0 on an empty table', () => {
    expect(repo.countAll()).toBe(0);
  });

  it('findById reconstitutes a class and countAll reflects inserts', () => {
    test.context.connection
      .prepare(
        `INSERT INTO ${TableNames.classes}
         (id, institutionId, academicYearId, name, gradeLevel, isActive, version, updatedAt)
         VALUES ('c-1', 'inst-1', 'ay-1', 'Grade 1 A', 'GRADE_1', 1, 1, '2026-07-20T00:00:00.000Z')`,
      )
      .run();
    expect(repo.findById('c-1')?.name).toBe('Grade 1 A');
    expect(repo.exists('c-1')).toBe(true);
    expect(repo.exists('nope')).toBe(false);
    expect(repo.countAll()).toBe(1);
  });
});
