import { describe, expect, it } from 'vitest';
import { GradeStatus } from '@nemis-desktop/types';
import { RecordGradeUseCase } from './record-grade';
import { InMemoryGradeRepository } from '../../testing/assessments/in-memory-grade-repository';
import {
  FixedClock,
  PassthroughUnitOfWork,
  RecordingLogger,
  SequentialIdGenerator,
} from '../../testing';
import { UseCaseException } from '../../exceptions';

function build() {
  const grades = new InMemoryGradeRepository();
  const useCase = new RecordGradeUseCase({
    grades,
    unitOfWork: new PassthroughUnitOfWork(),
    clock: new FixedClock('2026-07-18T00:00:00.000Z'),
    ids: new SequentialIdGenerator('grd'),
    logger: new RecordingLogger(),
  });
  return { grades, useCase };
}

describe('RecordGradeUseCase', () => {
  it('records a grade', async () => {
    const { grades, useCase } = build();
    const res = await useCase.execute({
      studentId: 'stu-1',
      subjectId: 'sub-1',
      obtained: 80,
      total: 100,
      status: GradeStatus.SUBMITTED,
    });
    expect(res.data.id).toBe('grd-1');
    expect(res.data.obtained).toBe(80);
    expect(grades.store.has('grd-1')).toBe(true);
  });

  it('translates a domain marks violation (obtained > total) into a UseCaseException', async () => {
    const { useCase } = build();
    await expect(
      useCase.execute({
        studentId: 'stu-1',
        subjectId: 'sub-1',
        obtained: 120,
        total: 100,
        status: GradeStatus.SUBMITTED,
      }),
    ).rejects.toBeInstanceOf(UseCaseException);
  });
});
