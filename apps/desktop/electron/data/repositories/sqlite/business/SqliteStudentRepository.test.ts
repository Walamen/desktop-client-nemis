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

function newStudentWith(
  id: string,
  admission: string,
  overrides: { gender?: Gender; admissionDate?: string; isActive?: boolean } = {},
): Student {
  const student = Student.create({
    id,
    institutionId: 'inst-1',
    firstName: 'Grace',
    lastName: 'Toe',
    admissionNumber: admission,
    dateOfBirth: '2015-01-01',
    gender: overrides.gender ?? Gender.FEMALE,
    admissionDate: overrides.admissionDate,
    occurredAt: '2026-07-20T00:00:00.000Z',
  });
  if (overrides.isActive === false) student.deactivate('tester', '2026-07-20T00:00:00.000Z');
  return student;
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

  it('countByGender counts only active students, grouped by gender', () => {
    repo.save(newStudentWith('s-1', 'ADM-1', { gender: Gender.MALE }));
    repo.save(newStudentWith('s-2', 'ADM-2', { gender: Gender.MALE }));
    repo.save(newStudentWith('s-3', 'ADM-3', { gender: Gender.FEMALE }));
    repo.save(newStudentWith('s-4', 'ADM-4', { gender: Gender.FEMALE, isActive: false }));
    const counts = repo.countByGender();
    expect(counts).toEqual(
      expect.arrayContaining([
        { gender: Gender.MALE, studentCount: 2 },
        { gender: Gender.FEMALE, studentCount: 1 },
      ]),
    );
    expect(counts).toHaveLength(2);
  });

  it('countRecentAdmissions counts active students admitted on/after the given date', () => {
    repo.save(newStudentWith('s-1', 'ADM-1', { admissionDate: '2026-07-01' }));
    repo.save(newStudentWith('s-2', 'ADM-2', { admissionDate: '2026-01-01' }));
    repo.save(newStudentWith('s-3', 'ADM-3', { admissionDate: '2026-07-15', isActive: false }));
    expect(repo.countRecentAdmissions('2026-04-20')).toBe(1);
  });
});
