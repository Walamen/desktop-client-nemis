import { describe, expect, it } from 'vitest';
import {
  ApplicationException,
  ApplicationValidationException,
  PermissionDeniedException,
  UnexpectedApplicationException,
  UseCaseException,
  WorkflowException,
} from './index';

describe('application exceptions', () => {
  it('base carries a code and name', () => {
    const err = new UseCaseException('nope');
    expect(err).toBeInstanceOf(ApplicationException);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('UseCaseException');
    expect(err.code).toBe('USE_CASE_ERROR');
  });

  it('validation exception carries issues', () => {
    const err = new ApplicationValidationException('bad', [
      { field: 'firstName', message: 'required' },
    ]);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.issues).toEqual([{ field: 'firstName', message: 'required' }]);
  });

  it('permission and workflow have distinct codes', () => {
    expect(new PermissionDeniedException('x').code).toBe('PERMISSION_DENIED');
    expect(new WorkflowException('x').code).toBe('WORKFLOW_ERROR');
  });

  it('unexpected preserves the cause', () => {
    const cause = new Error('boom');
    const err = new UnexpectedApplicationException('wrapped', { cause });
    expect(err.code).toBe('UNEXPECTED_ERROR');
    expect(err.cause).toBe(cause);
  });
});
