import { describe, expect, it } from 'vitest';
import { Enrollment } from '@nemis-desktop/domain';
import { EnrollmentStatus } from '@nemis-desktop/types';
import { WithdrawEnrollmentUseCase } from './withdraw-enrollment';
import { InMemoryEnrollmentRepository } from '../../testing/academics/in-memory-enrollment-repository';
import { FixedClock, PassthroughUnitOfWork, RecordingLogger } from '../../testing';
import { UseCaseException, WorkflowException } from '../../exceptions';

function seed(repo: InMemoryEnrollmentRepository): void {
  repo.save(
    Enrollment.create({
      id: 'enr-1',
      studentId: 'stu-1',
      classId: 'cls-1',
      academicYearId: 'ay-1',
      termId: 'term-1',
      occurredAt: '2026-07-18T00:00:00.000Z',
    }),
  );
}

function build() {
  const enrollments = new InMemoryEnrollmentRepository();
  const useCase = new WithdrawEnrollmentUseCase({
    enrollments,
    unitOfWork: new PassthroughUnitOfWork(),
    clock: new FixedClock('2026-07-20T00:00:00.000Z'),
    logger: new RecordingLogger(),
  });
  return { enrollments, useCase };
}

describe('WithdrawEnrollmentUseCase', () => {
  it('withdraws an active enrollment', async () => {
    const { enrollments, useCase } = build();
    seed(enrollments);
    const res = await useCase.execute({ enrollmentId: 'enr-1', actorId: 'user-9' });
    expect(res.data.status).toBe(EnrollmentStatus.WITHDRAWN);
  });

  it('throws a workflow exception when the enrollment is missing', async () => {
    const { useCase } = build();
    await expect(useCase.execute({ enrollmentId: 'nope', actorId: 'u' })).rejects.toBeInstanceOf(
      WorkflowException,
    );
  });

  it('translates the domain double-withdraw error into a UseCaseException', async () => {
    const { enrollments, useCase } = build();
    seed(enrollments);
    await useCase.execute({ enrollmentId: 'enr-1', actorId: 'user-9' });
    await expect(
      useCase.execute({ enrollmentId: 'enr-1', actorId: 'user-9' }),
    ).rejects.toBeInstanceOf(UseCaseException);
  });
});
