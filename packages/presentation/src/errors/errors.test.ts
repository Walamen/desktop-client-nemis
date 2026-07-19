import { describe, expect, it } from 'vitest';
import {
  ApplicationValidationException,
  PermissionDeniedException,
  UseCaseException,
  WorkflowException,
} from '@nemis-desktop/application';
import {
  LoadingError,
  NotImplementedPresentationError,
  OperationFailedError,
  PermissionError,
  PresentationError,
  UnexpectedPresentationError,
  ValidationError,
  toPresentationError,
} from './index';

describe('toPresentationError', () => {
  it('maps validation issues onto fieldErrors', () => {
    const err = toPresentationError(
      new ApplicationValidationException('invalid', [
        { field: 'firstName', message: 'firstName is required' },
      ]),
      'command',
    );
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).fieldErrors['firstName']).toBe('firstName is required');
    expect(err.userMessage).toBe('Please correct the highlighted fields.');
  });

  it('maps permission denied', () => {
    expect(toPresentationError(new PermissionDeniedException('no'), 'command')).toBeInstanceOf(
      PermissionError,
    );
  });

  it('maps use-case and workflow failures to OperationFailedError keeping the message', () => {
    const err = toPresentationError(new UseCaseException('Grade is not publishable'), 'command');
    expect(err).toBeInstanceOf(OperationFailedError);
    expect(err.userMessage).toBe('Grade is not publishable');
    expect(
      toPresentationError(new WorkflowException('Student not found'), 'command'),
    ).toBeInstanceOf(OperationFailedError);
  });

  it('maps unknown errors by context', () => {
    expect(toPresentationError(new Error('boom'), 'query')).toBeInstanceOf(LoadingError);
    expect(toPresentationError(new Error('boom'), 'command')).toBeInstanceOf(
      UnexpectedPresentationError,
    );
  });

  it('passes presentation errors through untouched', () => {
    const original = new NotImplementedPresentationError('Dashboard');
    expect(toPresentationError(original, 'query')).toBe(original);
    expect(original.userMessage).toBe('Dashboard is not available yet.');
    expect(original).toBeInstanceOf(PresentationError);
  });

  it('keeps the original throwable as cause for unknown errors', () => {
    const boom = new Error('boom');
    expect(toPresentationError(boom, 'query').cause).toBe(boom);
  });
});
