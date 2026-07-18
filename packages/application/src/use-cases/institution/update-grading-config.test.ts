import { describe, expect, it } from 'vitest';
import { UpdateGradingConfigUseCase } from './update-grading-config';
import { InMemoryGradingConfigRepository } from '../../testing/institution/in-memory-grading-config-repository';
import { PassthroughUnitOfWork, RecordingLogger } from '../../testing';
import { UseCaseException } from '../../exceptions';

function build() {
  const configs = new InMemoryGradingConfigRepository();
  const useCase = new UpdateGradingConfigUseCase({
    configs,
    unitOfWork: new PassthroughUnitOfWork(),
    logger: new RecordingLogger(),
  });
  return { configs, useCase };
}

describe('UpdateGradingConfigUseCase', () => {
  it('upserts a valid grading config', async () => {
    const { configs, useCase } = build();
    const res = await useCase.execute({
      id: 'inst-1',
      maxMarks: 100,
      passingMarks: 50,
      requireAdminApproval: true,
    });
    expect(res.data.passingMarks).toBe(50);
    expect(configs.store.has('inst-1')).toBe(true);
  });

  it('translates the domain invariant (passing > max) into a UseCaseException', async () => {
    const { useCase } = build();
    await expect(
      useCase.execute({ id: 'inst-1', maxMarks: 50, passingMarks: 90, requireAdminApproval: false }),
    ).rejects.toBeInstanceOf(UseCaseException);
  });
});
