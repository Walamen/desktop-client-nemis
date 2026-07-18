import { describe, expect, it } from 'vitest';
import { Gender } from '@nemis-desktop/types';
import { Student } from '@nemis-desktop/domain';
import { DeactivateStudentUseCase } from './deactivate-student';
import { InMemoryStudentRepository } from '../../testing/students/in-memory-student-repository';
import { FixedClock, PassthroughUnitOfWork, RecordingLogger } from '../../testing';
import { WorkflowException } from '../../exceptions';

function seedStudent(repo: InMemoryStudentRepository): void {
  repo.save(
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
}

function build() {
  const students = new InMemoryStudentRepository();
  const useCase = new DeactivateStudentUseCase({
    students,
    unitOfWork: new PassthroughUnitOfWork(),
    clock: new FixedClock('2026-07-19T00:00:00.000Z'),
    logger: new RecordingLogger(),
  });
  return { students, useCase };
}

describe('DeactivateStudentUseCase', () => {
  it('deactivates an existing student and bumps the version', async () => {
    const { students, useCase } = build();
    seedStudent(students);
    const res = await useCase.execute({ studentId: 'stu-1', actorId: 'user-9' });
    expect(res.data.isActive).toBe(false);
    expect(res.data.version).toBe(2);
    expect(students.findById('stu-1')?.isActive).toBe(false);
  });

  it('throws a workflow exception when the student does not exist', async () => {
    const { useCase } = build();
    await expect(
      useCase.execute({ studentId: 'missing', actorId: 'user-9' }),
    ).rejects.toBeInstanceOf(WorkflowException);
  });
});
