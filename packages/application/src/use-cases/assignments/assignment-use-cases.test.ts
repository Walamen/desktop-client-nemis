import { describe, expect, it } from 'vitest';
import { AssignmentStatus, AssignmentType } from '@nemis-desktop/types';
import { ListAssignmentsUseCase } from './list-assignments';
import { GetAssignmentUseCase } from './get-assignment';
import { CreateAssignmentUseCase } from './create-assignment';
import { UpdateAssignmentUseCase } from './update-assignment';
import { DeleteAssignmentUseCase } from './delete-assignment';
import { ListSubmissionsUseCase } from './list-submissions';
import { GradeSubmissionUseCase } from './grade-submission';
import { InMemoryAssignmentRepository } from '../../testing/assignments/in-memory-assignment-repository';
import { InMemoryAssignmentSubmissionRepository } from '../../testing/assignments/in-memory-assignment-submission-repository';
import {
  CollectingEventPublisher,
  FixedClock,
  PassthroughUnitOfWork,
  RecordingLogger,
  SequentialIdGenerator,
} from '../../testing';
import { PermissionDeniedException, WorkflowException } from '../../exceptions';

function build() {
  const assignments = new InMemoryAssignmentRepository();
  const submissions = new InMemoryAssignmentSubmissionRepository();
  const clock = new FixedClock('2026-08-01T08:00:00.000Z');
  const ids = new SequentialIdGenerator('a');
  const events = new CollectingEventPublisher();
  const logger = new RecordingLogger();
  const unitOfWork = new PassthroughUnitOfWork();

  const create = new CreateAssignmentUseCase({ assignments, unitOfWork, clock, ids, events, logger });
  const list = new ListAssignmentsUseCase({ assignments, logger });
  const get = new GetAssignmentUseCase({ assignments, logger });
  const update = new UpdateAssignmentUseCase({ assignments, unitOfWork, clock, logger });
  const remove = new DeleteAssignmentUseCase({ assignments, unitOfWork, logger });
  const listSubmissions = new ListSubmissionsUseCase({ assignments, submissions, logger });
  const gradeSubmission = new GradeSubmissionUseCase({
    assignments,
    submissions,
    unitOfWork,
    clock,
    ids,
    events,
    logger,
  });

  return { assignments, submissions, create, list, get, update, remove, listSubmissions, gradeSubmission, events };
}

const createDto = {
  classId: 'cls-1',
  teacherId: 'staff-1',
  title: 'Chapter 5 Homework',
  type: AssignmentType.HOMEWORK,
  status: AssignmentStatus.DRAFT,
  dueDate: '2026-08-10',
};

describe('CreateAssignmentUseCase', () => {
  it('creates an assignment and returns the enriched detail', async () => {
    const { create, events } = build();
    const res = await create.execute(createDto);
    expect(res.data.id).toBe('a-1');
    expect(res.data.title).toBe('Chapter 5 Homework');
    expect(res.data.status).toBe(AssignmentStatus.DRAFT);
    expect(events.published[0]?.name).toBe('AssignmentCreated');
  });
});

describe('ListAssignmentsUseCase', () => {
  it('only returns assignments owned by the requesting teacher', async () => {
    const { create, list } = build();
    await create.execute(createDto);
    await create.execute({ ...createDto, teacherId: 'staff-2' });
    const res = await list.execute({ teacherId: 'staff-1' });
    expect(res.data).toHaveLength(1);
    expect(res.data[0]?.teacherId).toBe('staff-1');
  });
});

describe('GetAssignmentUseCase', () => {
  it('rejects a teacher who does not own the assignment', async () => {
    const { create, get } = build();
    const created = await create.execute(createDto);
    await expect(get.execute({ id: created.data.id, teacherId: 'staff-2' })).rejects.toBeInstanceOf(
      PermissionDeniedException,
    );
  });
});

describe('UpdateAssignmentUseCase', () => {
  it('applies a partial patch without clobbering omitted fields', async () => {
    const { create, update } = build();
    const created = await create.execute(createDto);
    const res = await update.execute({
      id: created.data.id,
      teacherId: 'staff-1',
      status: AssignmentStatus.ACTIVE,
    });
    expect(res.data.status).toBe(AssignmentStatus.ACTIVE);
    expect(res.data.title).toBe('Chapter 5 Homework');
    expect(res.data.dueDate).toBe('2026-08-10');
  });

  it('carries a staged attachment through on create and update', async () => {
    const { create, update } = build();
    const created = await create.execute({
      ...createDto,
      attachmentUrl: 'local-file:///tmp/abc-notes.pdf',
      attachmentName: 'notes.pdf',
    });
    expect(created.data.attachmentUrl).toBe('local-file:///tmp/abc-notes.pdf');
    expect(created.data.attachmentName).toBe('notes.pdf');

    const updated = await update.execute({
      id: created.data.id,
      teacherId: 'staff-1',
      attachmentUrl: 'https://cdn.example/notes.pdf',
      attachmentName: 'notes.pdf',
    });
    expect(updated.data.attachmentUrl).toBe('https://cdn.example/notes.pdf');
  });
});

describe('DeleteAssignmentUseCase', () => {
  it('deletes a DRAFT assignment', async () => {
    const { create, remove, assignments } = build();
    const created = await create.execute(createDto);
    await remove.execute({ id: created.data.id, teacherId: 'staff-1' });
    expect(assignments.findById(created.data.id)).toBeNull();
  });

  it('refuses to delete a non-DRAFT assignment', async () => {
    const { create, update, remove } = build();
    const created = await create.execute(createDto);
    await update.execute({ id: created.data.id, teacherId: 'staff-1', status: AssignmentStatus.ACTIVE });
    await expect(remove.execute({ id: created.data.id, teacherId: 'staff-1' })).rejects.toBeInstanceOf(
      WorkflowException,
    );
  });
});

describe('ListSubmissionsUseCase / GradeSubmissionUseCase', () => {
  it('synthesizes a PENDING row for an enrolled student with no submission, then grading creates it', async () => {
    const { create, listSubmissions, gradeSubmission, submissions } = build();
    const created = await create.execute(createDto);
    submissions.enrolledStudentsByAssignment.set(created.data.id, [
      { studentId: 'stu-1', studentName: 'Ada Lovelace', admissionNumber: 'ADM-001' },
    ]);

    const before = await listSubmissions.execute({ assignmentId: created.data.id, teacherId: 'staff-1' });
    expect(before.data).toEqual([
      expect.objectContaining({ id: null, studentId: 'stu-1', status: 'PENDING' }),
    ]);

    const graded = await gradeSubmission.execute({
      assignmentId: created.data.id,
      studentId: 'stu-1',
      teacherId: 'staff-1',
      grade: 85,
      feedback: 'Great work',
    });
    expect(graded.data.status).toBe('GRADED');
    expect(graded.data.grade).toBe(85);
    expect(graded.data.id).not.toBeNull();
  });
});
