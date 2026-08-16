import { describe, expect, it } from 'vitest';
import { Gender } from '@nemis-desktop/types';
import { Student } from '@nemis-desktop/domain';
import { CreateGuardianUseCase } from './create-guardian';
import { InMemoryStudentRepository } from '../../testing/students/in-memory-student-repository';
import { InMemoryGuardianRepository } from '../../testing/students/in-memory-guardian-repository';
import {
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
      occurredAt: '2026-08-16T00:00:00.000Z',
    }),
  );
  const useCase = new CreateGuardianUseCase({
    students,
    guardians,
    unitOfWork: new PassthroughUnitOfWork(),
    clock: new FixedClock('2026-08-16T00:00:00.000Z'),
    ids: new SequentialIdGenerator('grd'),
    logger: new RecordingLogger(),
  });
  return { students, guardians, useCase };
}

describe('CreateGuardianUseCase', () => {
  it('stores the email on the created guardian', async () => {
    const { guardians, useCase } = build();
    await useCase.execute({
      studentId: 'stu-1',
      firstName: 'Grace',
      lastName: 'Hopper',
      relationship: 'Mother',
      phoneNumber: '0770000000',
      email: 'grace@example.com',
      isPrimary: true,
    });
    expect(guardians.store.get('grd-1')?.email).toBe('grace@example.com');
  });

  it('leaves the email undefined when not supplied', async () => {
    const { guardians, useCase } = build();
    await useCase.execute({
      studentId: 'stu-1',
      firstName: 'Grace',
      lastName: 'Hopper',
      relationship: 'Mother',
      phoneNumber: '0770000000',
      isPrimary: true,
    });
    expect(guardians.store.get('grd-1')?.email).toBeUndefined();
  });

  it('throws when the student is missing', async () => {
    const { useCase } = build();
    await expect(
      useCase.execute({
        studentId: 'nope',
        firstName: 'Grace',
        lastName: 'Hopper',
        relationship: 'Mother',
        phoneNumber: '0770000000',
        isPrimary: true,
      }),
    ).rejects.toBeInstanceOf(WorkflowException);
  });
});
