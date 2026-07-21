import { Subject } from '@nemis-desktop/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteSubjectRepository } from './SqliteSubjectRepository';

const ISO = '2026-07-21T00:00:00.000Z';

describe('SqliteSubjectRepository', () => {
  let test: TestContext;
  let repo: SqliteSubjectRepository;

  beforeEach(() => {
    test = createTestContext();
    repo = new SqliteSubjectRepository(test.context);
  });
  afterEach(() => test.cleanup());

  it('findById returns null when missing', () => {
    expect(repo.findById('missing')).toBeNull();
  });

  it('save() round-trips description through an upsert', () => {
    const subject = Subject.create({
      id: 's-1', institutionId: 'inst-1', name: 'Mathematics', code: 'math',
      description: 'Core subject', occurredAt: ISO,
    });
    repo.save(subject);
    const fetched = repo.findById('s-1');
    expect(fetched?.code).toBe('MATH');
    expect(fetched?.description).toBe('Core subject');

    subject.update({ description: null }, 'admin', ISO);
    repo.save(subject);
    expect(repo.findById('s-1')?.description).toBeUndefined();
  });

  it('existsByCode scopes to institution and excludes the given id', () => {
    repo.save(Subject.create({ id: 's-1', institutionId: 'inst-1', name: 'Mathematics', code: 'MATH', occurredAt: ISO }));
    expect(repo.existsByCode('inst-1', 'MATH')).toBe(true);
    expect(repo.existsByCode('inst-1', 'MATH', 's-1')).toBe(false);
    expect(repo.existsByCode('inst-2', 'MATH')).toBe(false);
  });

  it('findPage filters by keyword and includeInactive, and paginates', () => {
    repo.save(Subject.create({ id: 's-1', institutionId: 'inst-1', name: 'Mathematics', code: 'MATH', occurredAt: ISO }));
    const english = Subject.create({ id: 's-2', institutionId: 'inst-1', name: 'English', code: 'ENG', occurredAt: ISO });
    english.deactivate('admin', ISO);
    repo.save(english);

    expect(repo.findPage({ limit: 25, offset: 0 }).items).toHaveLength(1);
    expect(repo.findPage({ limit: 25, offset: 0, includeInactive: true }).items).toHaveLength(2);
    expect(repo.findPage({ limit: 25, offset: 0, keyword: 'math' }).items).toHaveLength(1);
    expect(repo.findPage({ limit: 25, offset: 0, keyword: 'ENG', includeInactive: true }).items).toHaveLength(1);
  });

  it('countAll counts only active subjects', () => {
    repo.save(Subject.create({ id: 's-1', institutionId: 'inst-1', name: 'Mathematics', code: 'MATH', occurredAt: ISO }));
    const english = Subject.create({ id: 's-2', institutionId: 'inst-1', name: 'English', code: 'ENG', occurredAt: ISO });
    english.deactivate('admin', ISO);
    repo.save(english);
    expect(repo.countAll()).toBe(1);
  });

  it('assign/unassign/isAssigned/listClassSubjects/countClasses round-trip the join table', () => {
    repo.save(Subject.create({ id: 's-1', institutionId: 'inst-1', name: 'Mathematics', code: 'MATH', occurredAt: ISO }));
    expect(repo.isAssigned('c-1', 's-1')).toBe(false);

    repo.assign({ id: 'link-1', classId: 'c-1', subjectId: 's-1', assignedAt: ISO });
    expect(repo.isAssigned('c-1', 's-1')).toBe(true);
    expect(repo.countClasses('s-1')).toBe(1);

    const links = repo.listClassSubjects('c-1');
    expect(links).toEqual([
      { classId: 'c-1', subjectId: 's-1', subjectName: 'Mathematics', subjectCode: 'MATH', assignedAt: ISO },
    ]);

    repo.unassign('c-1', 's-1');
    expect(repo.isAssigned('c-1', 's-1')).toBe(false);
    expect(repo.countClasses('s-1')).toBe(0);
  });
});
