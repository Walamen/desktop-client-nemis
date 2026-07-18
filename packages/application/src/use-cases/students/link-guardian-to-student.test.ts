import { describe, expect, it } from 'vitest';
import { Gender } from '@nemis-desktop/types';
import { Guardian, Student } from '@nemis-desktop/domain';
import { LinkGuardianToStudentUseCase } from './link-guardian-to-student';
import { InMemoryStudentRepository } from '../../testing/students/in-memory-student-repository';
import { InMemoryGuardianRepository } from '../../testing/students/in-memory-guardian-repository';
import {
  CollectingEventPublisher,
  FixedClock,
  PassthroughUnitOfWork,
  RecordingLogger,
  SequentialIdGenerator,
} from '../../testing';
import { WorkflowException } from '../../exceptions';

function build() {
  const students = new InMemoryStudentRepository();
  const guardians = new InMemoryGuardianRepository();
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
  guardians.store.set(
    'grd-1',
    Guardian.reconstitute({
      id: 'grd-1',
      firstName: 'Grace',
      lastName: 'Hopper',
      relationship: 'mother',
      phoneNumber: '0770000000',
      version: 1,
      updatedAt: '2026-07-18T00:00:00.000Z',
    }),
  );
  const events = new CollectingEventPublisher();
  const useCase = new LinkGuardianToStudentUseCase({
    students,
    guardians,
    unitOfWork: new PassthroughUnitOfWork(),
    clock: new FixedClock('2026-07-19T00:00:00.000Z'),
    ids: new SequentialIdGenerator('lnk'),
    events,
    logger: new RecordingLogger(),
  });
  return { students, events, useCase };
}

describe('LinkGuardianToStudentUseCase', () => {
  it('links an existing guardian to an existing student', async () => {
    const { students, events, useCase } = build();
    const res = await useCase.execute({
      studentId: 'stu-1',
      guardianId: 'grd-1',
      isPrimary: true,
      actorId: 'user-9',
    });
    expect(res.data.guardians).toEqual([{ id: 'lnk-1', guardianId: 'grd-1', isPrimary: true }]);
    expect(students.findById('stu-1')?.guardians).toHaveLength(1);
    expect(events.published[0]?.name).toBe('StudentGuardianLinked');
  });

  it('throws when the student is missing', async () => {
    const { useCase } = build();
    await expect(
      useCase.execute({ studentId: 'nope', guardianId: 'grd-1', isPrimary: false, actorId: 'u' }),
    ).rejects.toBeInstanceOf(WorkflowException);
  });

  it('throws when the guardian is missing', async () => {
    const { useCase } = build();
    await expect(
      useCase.execute({ studentId: 'stu-1', guardianId: 'nope', isPrimary: false, actorId: 'u' }),
    ).rejects.toBeInstanceOf(WorkflowException);
  });
});
