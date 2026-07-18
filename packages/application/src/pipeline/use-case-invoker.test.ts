import { describe, expect, it } from 'vitest';
import { BusinessRuleViolationException, DomainException } from '@nemis-desktop/domain';
import { invokeUseCase } from './use-case-invoker';
import {
  ApplicationValidationException,
  UnexpectedApplicationException,
  UseCaseException,
} from '../exceptions';
import { RecordingLogger } from '../testing/recording-logger';

describe('invokeUseCase', () => {
  it('returns the work result and logs start + success', async () => {
    const logger = new RecordingLogger();
    const result = await invokeUseCase('CreateStudent', logger, () => Promise.resolve(7));
    expect(result).toBe(7);
    expect(logger.infos.map((e) => e.message)).toEqual(['use-case.start', 'use-case.success']);
  });

  it('passes ApplicationException through unchanged and logs a failure', async () => {
    const logger = new RecordingLogger();
    const thrown = new ApplicationValidationException('bad', []);
    await expect(invokeUseCase('CreateStudent', logger, () => Promise.reject(thrown))).rejects.toBe(
      thrown,
    );
    expect(logger.errors).toHaveLength(1);
  });

  it('translates a DomainException into a UseCaseException', async () => {
    const logger = new RecordingLogger();
    const domainErr = new BusinessRuleViolationException('rule broke');
    expect(domainErr).toBeInstanceOf(DomainException);
    await expect(invokeUseCase('X', logger, () => Promise.reject(domainErr))).rejects.toMatchObject(
      { code: 'USE_CASE_ERROR', message: 'rule broke' },
    );
  });

  it('wraps unknown errors in UnexpectedApplicationException', async () => {
    const logger = new RecordingLogger();
    const boom = new Error('boom');
    await expect(invokeUseCase('X', logger, () => Promise.reject(boom))).rejects.toBeInstanceOf(
      UnexpectedApplicationException,
    );
  });

  it('reuses the same UseCaseException type as a subclass of ApplicationException', () => {
    expect(new UseCaseException('x').code).toBe('USE_CASE_ERROR');
  });
});
