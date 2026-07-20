import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Student } from '@nemis-desktop/domain';
import { Gender } from '@nemis-desktop/types';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteStudentRepository } from './SqliteStudentRepository';

function newStudent(id: string, admission: string): Student {
  return Student.create({
    id,
    institutionId: 'inst-1',
    firstName: 'Grace',
    lastName: 'Toe',
    admissionNumber: admission,
    dateOfBirth: '2015-01-01',
    gender: Gender.FEMALE,
    occurredAt: '2026-07-20T00:00:00.000Z',
  });
}

describe('SqliteStudentRepository', () => {
  let test: TestContext;
  let repo: SqliteStudentRepository;

  beforeEach(() => {
    test = createTestContext();
    repo = new SqliteStudentRepository(test.context);
  });
  afterEach(() => test.cleanup());

  it('countAll is 0 on an empty table', () => {
    expect(repo.countAll()).toBe(0);
  });

  it('save persists a student that round-trips through findById', () => {
    repo.save(newStudent('s-1', 'ADM-1'));
    const found = repo.findById('s-1');
    expect(found?.name.full).toBe('Grace Toe');
    expect(found?.admissionNumber.value).toBe('ADM-1');
    expect(found?.gender).toBe(Gender.FEMALE);
    expect(repo.countAll()).toBe(1);
  });

  it('existsByAdmissionNumber is scoped to the institution', () => {
    repo.save(newStudent('s-1', 'ADM-1'));
    expect(repo.existsByAdmissionNumber('inst-1', 'ADM-1')).toBe(true);
    expect(repo.existsByAdmissionNumber('inst-2', 'ADM-1')).toBe(false);
    expect(repo.existsByAdmissionNumber('inst-1', 'ADM-9')).toBe(false);
  });

  it('findPage returns items and total', () => {
    repo.save(newStudent('s-1', 'ADM-1'));
    repo.save(newStudent('s-2', 'ADM-2'));
    const page = repo.findPage({ limit: 1, offset: 0 });
    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(1);
  });

  it('save updates an existing row (upsert on id)', () => {
    const s = newStudent('s-1', 'ADM-1');
    repo.save(s);
    repo.save(s); // same id — must not throw or duplicate
    expect(repo.countAll()).toBe(1);
  });
});
