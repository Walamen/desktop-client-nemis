import { describe, expect, it } from 'vitest';
import { ForbiddenError, IPCError } from '@nemis-desktop/shared';
import {
  DuplicateEntityError,
  EntityNotFoundError,
  QueryError,
  RepositoryError,
  TransactionFailureError,
  ValidationError,
} from '../data/errors/repositoryErrors';
import { UnexpectedApplicationException } from '@nemis-desktop/application';
import {
  ConnectionError,
  DatabaseError,
  IntegrityError,
  MigrationError,
} from '../database/errors/errors';
import { toIpcError } from './errorMapping';

describe('toIpcError', () => {
  it('maps ValidationError to VALIDATION_FAILED with sanitized issues', () => {
    const payload = toIpcError(
      new ValidationError('Device validation failed', [
        { field: 'deviceName', message: 'is required' },
      ]),
    );
    expect(payload.code).toBe('VALIDATION_FAILED');
    expect(payload.issues).toEqual([{ field: 'deviceName', message: 'is required' }]);
  });

  it('maps the repository taxonomy to stable codes', () => {
    expect(toIpcError(new DuplicateEntityError('x')).code).toBe('DUPLICATE');
    expect(toIpcError(new EntityNotFoundError('x')).code).toBe('NOT_FOUND');
    expect(toIpcError(new TransactionFailureError('x')).code).toBe('CONFLICT');
    expect(toIpcError(new QueryError('x')).code).toBe('UNEXPECTED_ERROR');
    expect(toIpcError(new RepositoryError('x')).code).toBe('UNEXPECTED_ERROR');
  });

  it('maps the database taxonomy to availability codes', () => {
    expect(toIpcError(new ConnectionError('x')).code).toBe('DATABASE_UNAVAILABLE');
    expect(toIpcError(new IntegrityError('x')).code).toBe('DATABASE_UNAVAILABLE');
    expect(toIpcError(new MigrationError('x')).code).toBe('MIGRATION_REQUIRED');
    expect(toIpcError(new DatabaseError('x')).code).toBe('UNEXPECTED_ERROR');
  });

  it('unwraps application-pipeline wrappers so DB failures surface as DATABASE_UNAVAILABLE', () => {
    // invokeUseCase masks non-application errors exactly like this.
    const wrapped = new UnexpectedApplicationException('An unexpected error occurred.', {
      cause: new ConnectionError('SqliteStudentRepository.countAll: database operation failed (SQLITE_BUSY)'),
    });
    const payload = toIpcError(wrapped);
    expect(payload.code).toBe('DATABASE_UNAVAILABLE');
    expect(payload.message).toBe('The local database is currently unavailable.');
  });

  it('bounds cause-chain unwrapping so deep chains stay masked', () => {
    let error: Error = new ConnectionError('deep');
    for (let i = 0; i < 10; i += 1) {
      error = new Error(`layer ${i}`, { cause: error });
    }
    expect(toIpcError(error).code).toBe('UNEXPECTED_ERROR');
  });

  it('keeps ApplicationError codes that are part of the contract', () => {
    expect(toIpcError(new ForbiddenError('not allowed')).code).toBe('FORBIDDEN');
    expect(toIpcError(new IPCError('bad args')).code).toBe('IPC_ERROR');
  });

  it('masks everything else — including raw driver-shaped errors — as UNEXPECTED_ERROR', () => {
    const driverish = new Error('SQLITE_CORRUPT: database disk image is malformed');
    (driverish as Error & { code: string }).code = 'SQLITE_CORRUPT';
    for (const value of [driverish, new Error('boom'), 'string', 42, null, undefined]) {
      const payload = toIpcError(value);
      expect(payload.code).toBe('UNEXPECTED_ERROR');
      expect(payload.message).toBe('An unexpected error occurred.');
    }
  });

  it('never leaks internal messages for repository/database errors', () => {
    const payload = toIpcError(
      new DuplicateEntityError('AppSetting.setByKey: entity already exists'),
    );
    expect(payload.message).not.toContain('setByKey');
  });
});
