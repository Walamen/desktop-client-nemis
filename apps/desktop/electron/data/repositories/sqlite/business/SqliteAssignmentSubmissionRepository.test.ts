import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AssignmentSubmission } from '@nemis-desktop/domain';
import { SubmissionStatus } from '@nemis-desktop/types';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteAssignmentSubmissionRepository } from './SqliteAssignmentSubmissionRepository';

function seed(test: TestContext): void {
  const db = test.context.connection;
  db.prepare(
    `INSERT INTO academic_years (id,institutionId,code,startDate,endDate,isCurrent,version,updatedAt)
     VALUES ('ay-1','inst-1','2026','2026-01-01','2026-12-31',1,1,?)`,
  ).run('2026-01-01T00:00:00.000Z');
  db.prepare(
    `INSERT INTO terms (id,academicYearId,name,startDate,endDate,isCurrent,version,updatedAt)
     VALUES ('term-1','ay-1','Term 1','2026-01-01','2026-04-30',1,1,?)`,
  ).run('2026-01-01T00:00:00.000Z');
  db.prepare(
    `INSERT INTO classes (id,institutionId,academicYearId,name,gradeLevel,isActive,version,updatedAt)
     VALUES ('cls-1','inst-1','ay-1','Grade 10A','GRADE_10',1,1,?)`,
  ).run('2026-01-01T00:00:00.000Z');
  for (const [studentId, admissionNumber, firstName] of [
    ['stu-1', 'ADM-001', 'Ada'],
    ['stu-2', 'ADM-002', 'Bob'],
  ] as const) {
    db.prepare(
      `INSERT INTO students (id,institutionId,firstName,lastName,admissionNumber,dateOfBirth,gender,isActive,version,updatedAt)
       VALUES (?,'inst-1',?,'Lovelace',?,'2010-01-01','FEMALE',1,1,?)`,
    ).run(studentId, firstName, admissionNumber, '2026-01-01T00:00:00.000Z');
    db.prepare(
      `INSERT INTO enrollments (id,studentId,classId,academicYearId,termId,enrollmentDate,status,version,updatedAt)
       VALUES (?,?,'cls-1','ay-1','term-1','2026-01-01','ACTIVE',1,?)`,
    ).run(`enr-${studentId}`, studentId, '2026-01-01T00:00:00.000Z');
  }
  db.prepare(
    `INSERT INTO assignments (id,classId,subjectId,teacherId,title,type,status,instructions,dueDate,totalMarks,createdAt,updatedAt)
     VALUES ('a-1','cls-1',NULL,'staff-1','Chapter 5 Homework','HOMEWORK','ACTIVE',NULL,'2026-08-10',100,?,?)`,
  ).run('2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z');
}

describe('SqliteAssignmentSubmissionRepository', () => {
  let test: TestContext;
  let repo: SqliteAssignmentSubmissionRepository;

  beforeEach(() => {
    test = createTestContext();
    repo = new SqliteAssignmentSubmissionRepository(test.context);
    seed(test);
  });
  afterEach(() => test.cleanup());

  it('listByAssignment synthesizes a PENDING row for a student with no submission', () => {
    const rows = repo.listByAssignment('a-1');
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.id === null && r.status === 'PENDING')).toBe(true);
    expect(rows.map((r) => r.studentName).sort()).toEqual(['Ada Lovelace', 'Bob Lovelace']);
  });

  it('findByAssignmentAndStudent returns null when no row exists yet', () => {
    expect(repo.findByAssignmentAndStudent('a-1', 'stu-1')).toBeNull();
  });

  it('saveGrade creates a submission for a student who never submitted', () => {
    const submission = AssignmentSubmission.of({
      id: 'sub-1',
      assignmentId: 'a-1',
      studentId: 'stu-1',
      status: SubmissionStatus.PENDING,
      occurredAt: '2026-08-15T00:00:00.000Z',
    });
    submission.recordGrade(85, 'Great work', 'staff-1', '2026-08-15T00:00:00.000Z');
    repo.saveGrade(submission);

    const rows = repo.listByAssignment('a-1');
    const graded = rows.find((r) => r.studentId === 'stu-1');
    expect(graded?.id).toBe('sub-1');
    expect(graded?.status).toBe('GRADED');
    expect(graded?.grade).toBe(85);
    expect(graded?.feedback).toBe('Great work');
    expect(rows.find((r) => r.studentId === 'stu-2')?.status).toBe('PENDING');
  });

  it('saveGrade upserts by (assignmentId, studentId), not duplicating rows', () => {
    const first = AssignmentSubmission.of({
      id: 'sub-1',
      assignmentId: 'a-1',
      studentId: 'stu-1',
      status: SubmissionStatus.SUBMITTED,
      submittedAt: '2026-08-09T00:00:00.000Z',
      occurredAt: '2026-08-09T00:00:00.000Z',
    });
    repo.saveGrade(first);
    // A second, independently-constructed aggregate for the SAME student —
    // simulating the grade use case re-fetching then re-grading.
    const existing = repo.findByAssignmentAndStudent('a-1', 'stu-1')!;
    existing.recordGrade(90, 'Nice', 'staff-1', '2026-08-16T00:00:00.000Z');
    repo.saveGrade(existing);

    const rows = repo.listByAssignment('a-1');
    expect(rows.filter((r) => r.studentId === 'stu-1')).toHaveLength(1);
    expect(rows.find((r) => r.studentId === 'stu-1')?.grade).toBe(90);
  });
});
