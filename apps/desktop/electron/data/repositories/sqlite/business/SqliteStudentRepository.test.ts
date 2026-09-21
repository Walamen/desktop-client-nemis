import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Student } from '@nemis-desktop/domain';
import { Gender } from '@nemis-desktop/types';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteStudentRepository } from './SqliteStudentRepository';

function newStudent(id: string, nemisId: string): Student {
  return Student.create({
    id,
    institutionId: 'inst-1',
    firstName: 'Grace',
    lastName: 'Toe',
    nemisId,
    dateOfBirth: '2015-01-01',
    gender: Gender.FEMALE,
    occurredAt: '2026-07-20T00:00:00.000Z',
  });
}

function newStudentWith(
  id: string,
  nemisId: string,
  overrides: { gender?: Gender; admissionDate?: string; isActive?: boolean; institutionId?: string } = {},
): Student {
  const student = Student.create({
    id,
    institutionId: overrides.institutionId ?? 'inst-1',
    firstName: 'Grace',
    lastName: 'Toe',
    nemisId,
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
    repo.save(newStudent('s-1', '482915736045'));
    const found = repo.findById('s-1');
    expect(found?.name.full).toBe('Grace Toe');
    expect(found?.nemisId?.value).toBe('482915736045');
    expect(found?.gender).toBe(Gender.FEMALE);
    expect(repo.countAll()).toBe(1);
  });

  it('existsByNemisId is national, not scoped to the institution', () => {
    repo.save(newStudentWith('s1', '482915736045', { institutionId: 'inst-1' }));

    expect(repo.existsByNemisId('482915736045')).toBe(true);
    // Same ID, different school — still taken. This is the whole point.
    expect(repo.existsByNemisId('482915736045', 's2')).toBe(true);
    expect(repo.existsByNemisId('123456789015')).toBe(false);
  });

  it('excludes the named student so an update does not collide with itself', () => {
    repo.save(newStudent('s1', '482915736045'));
    expect(repo.existsByNemisId('482915736045', 's1')).toBe(false);
  });

  it('findPage returns items and total', () => {
    repo.save(newStudent('s-1', '482915736045'));
    repo.save(newStudent('s-2', '123456789015'));
    const page = repo.findPage({ limit: 1, offset: 0 });
    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(1);
  });

  it('save updates an existing row (upsert on id)', () => {
    const s = newStudent('s-1', '482915736045');
    repo.save(s);
    repo.save(s); // same id — must not throw or duplicate
    expect(repo.countAll()).toBe(1);
  });

  it('countByGender counts only active students, grouped by gender', () => {
    repo.save(newStudentWith('s-1', '482915736045', { gender: Gender.MALE }));
    repo.save(newStudentWith('s-2', '123456789015', { gender: Gender.MALE }));
    repo.save(newStudentWith('s-3', '999999999991', { gender: Gender.FEMALE }));
    repo.save(newStudentWith('s-4', '111111111113', { gender: Gender.FEMALE, isActive: false }));
    const counts = repo.countByGender();
    expect(counts).toEqual(
      expect.arrayContaining([
        { gender: Gender.MALE, studentCount: 2 },
        { gender: Gender.FEMALE, studentCount: 1 },
      ]),
    );
    expect(counts).toHaveLength(2);
  });

  it('countByInstitution groups active students by institution, ignoring inactive ones', () => {
    repo.save(newStudentWith('s-1', '482915736045', { institutionId: 'inst-1' }));
    repo.save(newStudentWith('s-2', '123456789015', { institutionId: 'inst-1' }));
    repo.save(newStudentWith('s-3', '999999999991', { institutionId: 'inst-2' }));
    repo.save(newStudentWith('s-4', '111111111113', { institutionId: 'inst-2', isActive: false }));
    const counts = repo.countByInstitution();
    expect(counts).toEqual(
      expect.arrayContaining([
        { institutionId: 'inst-1', studentCount: 2 },
        { institutionId: 'inst-2', studentCount: 1 },
      ]),
    );
    expect(counts).toHaveLength(2);
  });

  it('countRecentAdmissions counts active students admitted on/after the given date', () => {
    repo.save(newStudentWith('s-1', '482915736045', { admissionDate: '2026-07-01' }));
    repo.save(newStudentWith('s-2', '123456789015', { admissionDate: '2026-01-01' }));
    repo.save(newStudentWith('s-3', '999999999991', { admissionDate: '2026-07-15', isActive: false }));
    expect(repo.countRecentAdmissions('2026-04-20')).toBe(1);
  });

  describe('legacy rows with a NULL nemisId (migration 024 pre-rollout state)', () => {
    function insertLegacyRow(id: string): void {
      test.context.connection
        .prepare(
          `INSERT INTO students
           (id, institutionId, firstName, middleName, lastName, nemisId, dateOfBirth, gender, gradeLevel, admissionDate, phoneNumber, email, address, isActive, version, updatedAt, lastModifiedBy, deviceId)
           VALUES (?, 'inst-1', 'Grace', NULL, 'Toe', NULL, '2015-01-01', 'FEMALE', NULL, NULL, NULL, NULL, NULL, 1, 1, '2026-07-20T00:00:00.000Z', NULL, NULL)`,
        )
        .run(id);
    }

    it('findById returns a student with an absent nemisId instead of throwing', () => {
      insertLegacyRow('s-legacy');
      const found = repo.findById('s-legacy');
      expect(found).not.toBeNull();
      expect(found?.nemisId).toBeUndefined();
      expect(found?.name.full).toBe('Grace Toe');
    });

    it('findPage returns the legacy row with an absent nemisId instead of throwing', () => {
      insertLegacyRow('s-legacy');
      repo.save(newStudent('s-normal', '482915736045'));
      const page = repo.findPage({ limit: 10, offset: 0 });
      expect(page.total).toBe(2);
      const legacy = page.items.find((s) => s.id === 's-legacy');
      expect(legacy?.nemisId).toBeUndefined();
    });
  });
});
