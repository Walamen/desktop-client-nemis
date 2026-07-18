import { describe, expect, it } from 'vitest';
import { Gender, GradeLevel } from '@nemis-desktop/types';
import { CreateStudentUseCase } from './create-student';
import { InMemoryStudentRepository } from '../../testing/students/in-memory-student-repository';
import {
  CollectingEventPublisher,
  FixedClock,
  PassthroughUnitOfWork,
  RecordingLogger,
  SequentialIdGenerator,
} from '../../testing';
import { ApplicationValidationException, WorkflowException } from '../../exceptions';

function build() {
  const students = new InMemoryStudentRepository();
  const events = new CollectingEventPublisher();
  const uow = new PassthroughUnitOfWork();
  const useCase = new CreateStudentUseCase({
    students,
    unitOfWork: uow,
    clock: new FixedClock('2026-07-18T00:00:00.000Z'),
    ids: new SequentialIdGenerator('stu'),
    events,
    logger: new RecordingLogger(),
  });
  return { students, events, uow, useCase };
}

const validInput = {
  institutionId: 'inst-1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  admissionNumber: 'ADM-001',
  dateOfBirth: '2015-06-01',
  gender: Gender.FEMALE,
  gradeLevel: GradeLevel.GRADE_1,
};

describe('CreateStudentUseCase', () => {
  it('creates, persists inside the unit of work, and returns the output', async () => {
    const { students, uow, useCase } = build();
    const res = await useCase.execute(validInput);
    expect(res.data.id).toBe('stu-1');
    expect(res.data.fullName).toBe('Ada Lovelace');
    expect(students.store.has('stu-1')).toBe(true);
    expect(uow.runCount).toBe(1);
  });

  it('publishes StudentRegistered after persistence', async () => {
    const { events, useCase } = build();
    await useCase.execute(validInput);
    expect(events.published).toEqual([
      {
        name: 'StudentRegistered',
        occurredAt: '2026-07-18T00:00:00.000Z',
        studentId: 'stu-1',
        institutionId: 'inst-1',
        admissionNumber: 'ADM-001',
      },
    ]);
  });

  it('rejects missing required fields with a validation exception', async () => {
    const { useCase } = build();
    await expect(
      useCase.execute({ ...validInput, firstName: '', admissionNumber: '' }),
    ).rejects.toBeInstanceOf(ApplicationValidationException);
  });

  it('rejects a duplicate admission number in the same institution', async () => {
    const { useCase } = build();
    await useCase.execute(validInput);
    await expect(useCase.execute(validInput)).rejects.toBeInstanceOf(WorkflowException);
  });
});
