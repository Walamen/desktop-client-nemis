import { describe, expect, it } from 'vitest';
import { EnrollStudentUseCase } from './enroll-student';
import { InMemoryEnrollmentRepository } from '../../testing/academics/in-memory-enrollment-repository';
import { InMemoryClassRepository } from '../../testing/academics/in-memory-class-repository';
import { InMemoryStudentRepository } from '../../testing/students/in-memory-student-repository';
import { Class, Student } from '@nemis-desktop/domain';
import { Gender, GradeLevel } from '@nemis-desktop/types';
import { EnrollmentStatus } from '@nemis-desktop/types';
import {
  CollectingEventPublisher,
  FixedClock,
  PassthroughUnitOfWork,
  RecordingLogger,
  SequentialIdGenerator,
} from '../../testing';
import { WorkflowException } from '../../exceptions';

function build() {
  const enrollments = new InMemoryEnrollmentRepository();
  const classes = new InMemoryClassRepository();
  const students = new InMemoryStudentRepository();
  students.save(
    Student.create({
      id: 'stu-1',
      institutionId: 'inst-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      admissionNumber: 'ADM-001',
      dateOfBirth: '2015-06-01',
      gender: Gender.FEMALE,
      occurredAt: '2026-07-18T00:00:00.000Z',
    }),
  );
  classes.store.set(
    'cls-1',
    Class.reconstitute({
      id: 'cls-1',
      institutionId: 'inst-1',
      academicYearId: 'ay-1',
      name: 'Grade 1 A',
      gradeLevel: GradeLevel.GRADE_1,
      isActive: true,
      version: 1,
      updatedAt: '2026-07-18T00:00:00.000Z',
    }),
  );
  const events = new CollectingEventPublisher();
  const useCase = new EnrollStudentUseCase({
    enrollments,
    classes,
    students,
    unitOfWork: new PassthroughUnitOfWork(),
    clock: new FixedClock('2026-07-18T00:00:00.000Z'),
    ids: new SequentialIdGenerator('enr'),
    events,
    logger: new RecordingLogger(),
  });
  return { enrollments, events, useCase };
}

const dto = {
  studentId: 'stu-1',
  classId: 'cls-1',
  academicYearId: 'ay-1',
  termId: 'term-1',
} as const;

describe('EnrollStudentUseCase', () => {
  it('creates an active enrollment and emits an event', async () => {
    const { enrollments, events, useCase } = build();
    const res = await useCase.execute(dto);
    expect(res.data.id).toBe('enr-1');
    expect(res.data.status).toBe(EnrollmentStatus.ACTIVE);
    expect(enrollments.store.has('enr-1')).toBe(true);
    expect(events.published[0]?.name).toBe('EnrollmentRegistered');
  });

  it('rejects when the student does not exist', async () => {
    const { useCase } = build();
    await expect(useCase.execute({ ...dto, studentId: 'nope' })).rejects.toBeInstanceOf(
      WorkflowException,
    );
  });

  it('rejects a duplicate active enrollment in the same class', async () => {
    const { useCase } = build();
    await useCase.execute(dto);
    await expect(useCase.execute(dto)).rejects.toBeInstanceOf(WorkflowException);
  });
});
