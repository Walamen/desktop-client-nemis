import { Class } from '@nemis-desktop/domain';
import { GradeLevel } from '@nemis-desktop/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TableNames } from '../../../../database/schema/tableNames';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteClassRepository } from './SqliteClassRepository';

const ISO = '2026-07-21T00:00:00.000Z';

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

  it('save() round-trips section and capacity through an upsert', () => {
    const entity = Class.create({
      id: 'c-1',
      institutionId: 'inst-1',
      academicYearId: 'ay-1',
      name: 'JSS1-A',
      section: 'A',
      gradeLevel: GradeLevel.GRADE_7,
      capacity: 40,
      occurredAt: ISO,
    });
    repo.save(entity);
    const fetched = repo.findById('c-1');
    expect(fetched?.section).toBe('A');
    expect(fetched?.capacity).toBe(40);

    entity.update({ section: null, capacity: 45 }, 'admin', ISO);
    repo.save(entity);
    const updated = repo.findById('c-1');
    expect(updated?.section).toBeUndefined();
    expect(updated?.capacity).toBe(45);
  });

  it('existsByName scopes to institution + year and excludes the given id', () => {
    repo.save(
      Class.create({
        id: 'c-1', institutionId: 'inst-1', academicYearId: 'ay-1', name: 'JSS1-A',
        gradeLevel: GradeLevel.GRADE_7, occurredAt: ISO,
      }),
    );
    expect(repo.existsByName('inst-1', 'ay-1', 'JSS1-A')).toBe(true);
    expect(repo.existsByName('inst-1', 'ay-1', 'JSS1-A', 'c-1')).toBe(false);
    expect(repo.existsByName('inst-1', 'ay-2', 'JSS1-A')).toBe(false);
    expect(repo.existsByName('inst-2', 'ay-1', 'JSS1-A')).toBe(false);
  });

  it('findPage filters by keyword, gradeLevel, includeInactive and paginates', () => {
    repo.save(
      Class.create({
        id: 'c-1', institutionId: 'inst-1', academicYearId: 'ay-1', name: 'JSS1-A',
        gradeLevel: GradeLevel.GRADE_7, occurredAt: ISO,
      }),
    );
    const b = Class.create({
      id: 'c-2', institutionId: 'inst-1', academicYearId: 'ay-1', name: 'JSS2-B',
      gradeLevel: GradeLevel.GRADE_8, occurredAt: ISO,
    });
    b.deactivate('admin', ISO);
    repo.save(b);

    expect(repo.findPage({ limit: 25, offset: 0 }).items).toHaveLength(1);
    expect(repo.findPage({ limit: 25, offset: 0, includeInactive: true }).items).toHaveLength(2);
    expect(
      repo.findPage({ limit: 25, offset: 0, includeInactive: true, gradeLevel: GradeLevel.GRADE_8 })
        .items,
    ).toHaveLength(1);
    expect(repo.findPage({ limit: 25, offset: 0, keyword: 'JSS1' }).items).toHaveLength(1);
    expect(repo.findPage({ limit: 1, offset: 0 }).total).toBe(1);
  });

  it('countByGradeLevel aggregates active classes only', () => {
    repo.save(
      Class.create({
        id: 'c-1', institutionId: 'inst-1', academicYearId: 'ay-1', name: 'A',
        gradeLevel: GradeLevel.GRADE_7, occurredAt: ISO,
      }),
    );
    repo.save(
      Class.create({
        id: 'c-2', institutionId: 'inst-1', academicYearId: 'ay-1', name: 'B',
        gradeLevel: GradeLevel.GRADE_7, occurredAt: ISO,
      }),
    );
    const counts = repo.countByGradeLevel();
    expect(counts).toContainEqual({ gradeLevel: GradeLevel.GRADE_7, classCount: 2 });
  });

  it('countSubjects reflects class_subjects rows', () => {
    repo.save(
      Class.create({
        id: 'c-1', institutionId: 'inst-1', academicYearId: 'ay-1', name: 'A',
        gradeLevel: GradeLevel.GRADE_7, occurredAt: ISO,
      }),
    );
    expect(repo.countSubjects('c-1')).toBe(0);
    test.context.connection
      .prepare(
        `INSERT INTO ${TableNames.subjects} (id, institutionId, name, code, isActive, version, updatedAt)
         VALUES ('s-1', 'inst-1', 'Mathematics', 'MATH', 1, 1, '2026-07-20T00:00:00.000Z')`,
      )
      .run();
    test.context.connection
      .prepare(
        `INSERT INTO ${TableNames.classSubjects} (id, classId, subjectId, assignedAt, version, updatedAt)
         VALUES ('cs-1', 'c-1', 's-1', '2026-07-20T00:00:00.000Z', 1, '2026-07-20T00:00:00.000Z')`,
      )
      .run();
    expect(repo.countSubjects('c-1')).toBe(1);
  });
});
