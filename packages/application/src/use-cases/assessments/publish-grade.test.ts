import { describe, expect, it } from 'vitest';
import { Grade } from '@nemis-desktop/domain';
import { GradeStatus } from '@nemis-desktop/types';
import { PublishGradeUseCase } from './publish-grade';
import { InMemoryGradeRepository } from '../../testing/assessments/in-memory-grade-repository';
import {
  CollectingEventPublisher,
  FixedClock,
  PassthroughUnitOfWork,
  RecordingLogger,
} from '../../testing';
import { UseCaseException, WorkflowException } from '../../exceptions';

function seed(repo: InMemoryGradeRepository, status: GradeStatus): void {
  repo.save(
    Grade.create({
      id: 'grd-1',
      studentId: 'stu-1',
      subjectId: 'sub-1',
      obtained: 80,
      total: 100,
      status,
      occurredAt: '2026-07-18T00:00:00.000Z',
    }),
  );
}

function build() {
  const grades = new InMemoryGradeRepository();
  const events = new CollectingEventPublisher();
  const useCase = new PublishGradeUseCase({
    grades,
    unitOfWork: new PassthroughUnitOfWork(),
    clock: new FixedClock('2026-07-19T00:00:00.000Z'),
    events,
    logger: new RecordingLogger(),
  });
  return { grades, events, useCase };
}

describe('PublishGradeUseCase', () => {
  it('publishes a submitted grade and emits GradePublished', async () => {
    const { grades, events, useCase } = build();
    seed(grades, GradeStatus.SUBMITTED);
    const res = await useCase.execute({ gradeId: 'grd-1', actorId: 'user-9' });
    expect(res.data.isPublished).toBe(true);
    expect(res.data.status).toBe(GradeStatus.PUBLISHED);
    expect(events.published[0]?.name).toBe('GradePublished');
  });

  it('throws a workflow exception when the grade is missing', async () => {
    const { useCase } = build();
    await expect(
      useCase.execute({ gradeId: 'nope', actorId: 'u' }),
    ).rejects.toBeInstanceOf(WorkflowException);
  });

  it('translates a non-publishable status into a UseCaseException', async () => {
    const { grades, useCase } = build();
    seed(grades, GradeStatus.DRAFT);
    await expect(
      useCase.execute({ gradeId: 'grd-1', actorId: 'user-9' }),
    ).rejects.toBeInstanceOf(UseCaseException);
  });
});
