import { describe, expect, it } from 'vitest';
import { AssignmentStatus, AssignmentType, SubmissionStatus } from '@nemis-desktop/types';
import { Assignment } from './entities/assignment';
import { AssignmentSubmission } from './entities/assignment-submission';

const ISO = '2026-08-01T00:00:00.000Z';

describe('Assignment', () => {
  it('creates and emits AssignmentCreated', () => {
    const assignment = Assignment.create({
      id: 'a-1',
      classId: 'c-1',
      teacherId: 'staff-1',
      title: 'Chapter 5 Homework',
      type: AssignmentType.HOMEWORK,
      status: AssignmentStatus.DRAFT,
      dueDate: '2026-08-10',
      occurredAt: ISO,
    });
    expect(assignment.status).toBe(AssignmentStatus.DRAFT);
    expect(assignment.pullDomainEvents()[0]?.name).toBe('AssignmentCreated');
  });

  it('update() applies a partial patch, bumps version, and emits AssignmentUpdated', () => {
    const assignment = Assignment.create({
      id: 'a-1',
      classId: 'c-1',
      teacherId: 'staff-1',
      title: 'Draft',
      type: AssignmentType.HOMEWORK,
      status: AssignmentStatus.DRAFT,
      dueDate: '2026-08-10',
      occurredAt: ISO,
    });
    assignment.pullDomainEvents();
    assignment.update({ status: AssignmentStatus.ACTIVE, title: 'Chapter 5 Homework' }, 'staff-1', ISO);
    expect(assignment.status).toBe(AssignmentStatus.ACTIVE);
    expect(assignment.title).toBe('Chapter 5 Homework');
    expect(assignment.classId).toBe('c-1'); // untouched fields survive the patch
    // dueDate is a valid patch field but was omitted from this call — must
    // NOT be wiped to undefined by the partial update.
    expect(assignment.dueDate).toBe('2026-08-10');
    expect(assignment.version).toBe(2);
    expect(assignment.pullDomainEvents()[0]?.name).toBe('AssignmentUpdated');
  });
});

describe('AssignmentSubmission', () => {
  it('grade() moves a submitted response to GRADED', () => {
    const submission = AssignmentSubmission.of({
      id: 's-1',
      assignmentId: 'a-1',
      studentId: 'stu-1',
      status: SubmissionStatus.SUBMITTED,
      submittedAt: '2026-08-09T10:00:00.000Z',
      response: 'My answer',
      occurredAt: ISO,
    });
    submission.recordGrade(85, 'Well done', 'staff-1', ISO);
    expect(submission.status).toBe(SubmissionStatus.GRADED);
    expect(submission.grade).toBe(85);
    expect(submission.feedback).toBe('Well done');
    expect(submission.submittedAt).toBe('2026-08-09T10:00:00.000Z');
    expect(submission.pullDomainEvents()[0]?.name).toBe('SubmissionGraded');
  });

  it('grade() on a never-submitted (PENDING placeholder) row backfills submittedAt', () => {
    const submission = AssignmentSubmission.of({
      id: 's-2',
      assignmentId: 'a-1',
      studentId: 'stu-2',
      status: SubmissionStatus.PENDING,
      occurredAt: ISO,
    });
    submission.recordGrade(0, undefined, 'staff-1', ISO);
    expect(submission.status).toBe(SubmissionStatus.GRADED);
    expect(submission.submittedAt).toBe(ISO);
  });
});
