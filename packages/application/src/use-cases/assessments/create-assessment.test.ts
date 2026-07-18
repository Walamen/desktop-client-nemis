import { describe, expect, it } from 'vitest';
import { AssessmentType } from '@nemis-desktop/types';
import { CreateAssessmentUseCase } from './create-assessment';
import { InMemoryAssessmentRepository } from '../../testing/assessments/in-memory-assessment-repository';
import {
  CollectingEventPublisher,
  FixedClock,
  PassthroughUnitOfWork,
  RecordingLogger,
  SequentialIdGenerator,
} from '../../testing';
import { ApplicationValidationException } from '../../exceptions';

function build() {
  const assessments = new InMemoryAssessmentRepository();
  const events = new CollectingEventPublisher();
  const useCase = new CreateAssessmentUseCase({
    assessments,
    unitOfWork: new PassthroughUnitOfWork(),
    clock: new FixedClock('2026-07-18T00:00:00.000Z'),
    ids: new SequentialIdGenerator('asm'),
    events,
    logger: new RecordingLogger(),
  });
  return { assessments, events, useCase };
}

const dto = {
  classId: 'cls-1',
  subjectId: 'sub-1',
  gradingPeriodId: 'gp-1',
  type: AssessmentType.EXAM,
  totalMarks: 100,
};

describe('CreateAssessmentUseCase', () => {
  it('creates an assessment and emits an event', async () => {
    const { assessments, events, useCase } = build();
    const res = await useCase.execute(dto);
    expect(res.data.id).toBe('asm-1');
    expect(res.data.totalMarks).toBe(100);
    expect(assessments.store.has('asm-1')).toBe(true);
    expect(events.published[0]?.name).toBe('AssessmentCreated');
  });

  it('rejects a non-positive total marks value', async () => {
    const { useCase } = build();
    await expect(useCase.execute({ ...dto, totalMarks: 0 })).rejects.toBeInstanceOf(
      ApplicationValidationException,
    );
  });
});
