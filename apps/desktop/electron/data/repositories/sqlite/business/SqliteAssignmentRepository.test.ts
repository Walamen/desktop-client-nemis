import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Assignment } from '@nemis-desktop/domain';
import { AssignmentStatus, AssignmentType } from '@nemis-desktop/types';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteAssignmentRepository } from './SqliteAssignmentRepository';

function seedClassWithStudents(test: TestContext, classId: string, studentCount: number): void {
  const db = test.context.connection;
  db.prepare(
    `INSERT INTO academic_years (id,institutionId,code,startDate,endDate,isCurrent,version,updatedAt)
     VALUES ('ay-1','inst-1','2026',?,?,1,1,?)`,
  ).run('2026-01-01', '2026-12-31', '2026-01-01T00:00:00.000Z');
  db.prepare(
    `INSERT INTO terms (id,academicYearId,name,startDate,endDate,isCurrent,version,updatedAt)
     VALUES ('term-1','ay-1','Term 1',?,?,1,1,?)`,
  ).run('2026-01-01', '2026-04-30', '2026-01-01T00:00:00.000Z');
  db.prepare(
    `INSERT INTO classes (id,institutionId,academicYearId,name,gradeLevel,isActive,version,updatedAt)
     VALUES (?,'inst-1','ay-1','Grade 10A','GRADE_10',1,1,?)`,
  ).run(classId, '2026-01-01T00:00:00.000Z');
  for (let i = 1; i <= studentCount; i += 1) {
    const studentId = `stu-${classId}-${i}`;
    db.prepare(
      `INSERT INTO students (id,institutionId,firstName,lastName,admissionNumber,dateOfBirth,gender,isActive,version,updatedAt)
       VALUES (?,'inst-1',?,?,?,'2010-01-01','FEMALE',1,1,?)`,
    ).run(studentId, `First${i}`, `Last${i}`, `ADM-${classId}-${i}`, '2026-01-01T00:00:00.000Z');
    db.prepare(
      `INSERT INTO enrollments (id,studentId,classId,academicYearId,termId,enrollmentDate,status,version,updatedAt)
       VALUES (?,?,?,'ay-1','term-1','2026-01-01','ACTIVE',1,?)`,
    ).run(`enr-${studentId}`, studentId, classId, '2026-01-01T00:00:00.000Z');
  }
}

function record(id: string, overrides: Partial<Parameters<typeof Assignment.create>[0]> = {}): Assignment {
  return Assignment.create({
    id,
    classId: 'cls-1',
    teacherId: 'staff-1',
    title: 'Chapter 5 Homework',
    type: AssignmentType.HOMEWORK,
    status: AssignmentStatus.DRAFT,
    dueDate: '2026-08-10',
    occurredAt: '2026-08-01T08:00:00.000Z',
    ...overrides,
  });
}

describe('SqliteAssignmentRepository', () => {
  let test: TestContext;
  let repo: SqliteAssignmentRepository;

  beforeEach(() => {
    test = createTestContext();
    repo = new SqliteAssignmentRepository(test.context);
    seedClassWithStudents(test, 'cls-1', 3);
  });
  afterEach(() => test.cleanup());

  it('save + findById round-trips an assignment', () => {
    repo.save(record('a-1'));
    const found = repo.findById('a-1');
    expect(found?.title).toBe('Chapter 5 Homework');
    expect(found?.status).toBe(AssignmentStatus.DRAFT);
  });

  it('findById returns null for a missing id', () => {
    expect(repo.findById('nope')).toBeNull();
  });

  it('save upserts by id (ON CONFLICT), preserving createdAt', () => {
    repo.save(record('a-1'));
    const detailBefore = repo.getDetail('a-1');
    const updated = record('a-1', { status: AssignmentStatus.ACTIVE, title: 'Updated title' });
    repo.save(updated);
    const detailAfter = repo.getDetail('a-1');
    expect(detailAfter?.title).toBe('Updated title');
    expect(detailAfter?.status).toBe(AssignmentStatus.ACTIVE);
    expect(detailAfter?.createdAt).toBe(detailBefore?.createdAt);
  });

  it('delete removes the row', () => {
    repo.save(record('a-1'));
    repo.delete('a-1');
    expect(repo.findById('a-1')).toBeNull();
  });

  it('getDetail joins className/subjectName and computes totalStudents', () => {
    repo.save(record('a-1'));
    const detail = repo.getDetail('a-1');
    expect(detail?.className).toBe('Grade 10A');
    expect(detail?.subjectName).toBeUndefined();
    expect(detail?.totalStudents).toBe(3);
    expect(detail?.submittedCount).toBe(0);
  });

  it('list filters by teacherId, classId and status', () => {
    repo.save(record('a-1', { teacherId: 'staff-1', classId: 'cls-1' }));
    repo.save(record('a-2', { teacherId: 'staff-2', classId: 'cls-1' }));
    repo.save(record('a-3', { teacherId: 'staff-1', classId: 'cls-1', status: AssignmentStatus.ACTIVE }));

    expect(repo.list({ teacherId: 'staff-1' })).toHaveLength(2);
    expect(repo.list({ teacherId: 'staff-1', status: AssignmentStatus.ACTIVE })).toHaveLength(1);
    expect(repo.list({ teacherId: 'staff-2' })).toHaveLength(1);
  });
});
