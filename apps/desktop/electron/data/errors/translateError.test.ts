import { describe, expect, it } from 'vitest';
import { ConstraintError, TransactionError } from '../../database/errors/errors';
import {
  DuplicateEntityError,
  EntityNotFoundError,
  RepositoryError,
  TransactionFailureError,
  ValidationError,
} from './repositoryErrors';
import { translateDatabaseError } from './translateError';

function sqliteError(code: string): Error {
  const error = new Error(`driver failure (${code})`);
  (error as Error & { code: string }).code = code;
  return error;
}

describe('repository error taxonomy', () => {
  it('sets name and code on every subclass', () => {
    const notFound = new EntityNotFoundError('Device not found: x');
    expect(notFound.code).toBe('REPO_NOT_FOUND');
    expect(notFound.name).toBe('EntityNotFoundError');
    expect(notFound).toBeInstanceOf(RepositoryError);
  });

  it('ValidationError carries its issues', () => {
    const error = new ValidationError('Device validation failed', [
      { field: 'deviceName', message: 'is required' },
    ]);
    expect(error.code).toBe('REPO_VALIDATION');
    expect(error.issues).toEqual([{ field: 'deviceName', message: 'is required' }]);
  });
});

describe('translateDatabaseError', () => {
  it('passes RepositoryError through unchanged', () => {
    const original = new EntityNotFoundError('Device not found: x');
    expect(translateDatabaseError(original, 'ctx')).toBe(original);
  });

  it('maps unique violations to DuplicateEntityError', () => {
    const result = translateDatabaseError(sqliteError('SQLITE_CONSTRAINT_UNIQUE'), 'AppSetting.setByKey');
    expect(result).toBeInstanceOf(DuplicateEntityError);
    expect(result.code).toBe('REPO_DUPLICATE');
  });

  it('maps primary-key violations to DuplicateEntityError', () => {
    const result = translateDatabaseError(sqliteError('SQLITE_CONSTRAINT_PRIMARYKEY'), 'Device.create');
    expect(result).toBeInstanceOf(DuplicateEntityError);
  });

  it('maps non-unique constraint failures to REPO_UNKNOWN, not duplicate', () => {
    const result = translateDatabaseError(sqliteError('SQLITE_CONSTRAINT_CHECK'), 'ctx');
    expect(result).toBeInstanceOf(RepositoryError);
    expect(result).not.toBeInstanceOf(DuplicateEntityError);
    expect(result.code).toBe('REPO_UNKNOWN');
  });

  it('detects unique violation on the cause chain of an already-wrapped ConstraintError', () => {
    const wrapped = new ConstraintError('ctx: database operation failed (SQLITE_CONSTRAINT_UNIQUE)', {
      cause: sqliteError('SQLITE_CONSTRAINT_UNIQUE'),
    });
    expect(translateDatabaseError(wrapped, 'ctx')).toBeInstanceOf(DuplicateEntityError);
  });

  it('maps TransactionError to TransactionFailureError', () => {
    const result = translateDatabaseError(new TransactionError('boom'), 'ctx');
    expect(result).toBeInstanceOf(TransactionFailureError);
    expect(result.code).toBe('REPO_TRANSACTION');
  });

  it('keeps the original error reachable via cause', () => {
    const original = sqliteError('SQLITE_BUSY');
    const result = translateDatabaseError(original, 'ctx');
    expect(result.code).toBe('REPO_UNKNOWN');
    let found = false;
    let current: unknown = result;
    while (current instanceof Error) {
      if (current === original) {
        found = true;
        break;
      }
      current = current.cause;
    }
    expect(found).toBe(true);
  });
});
