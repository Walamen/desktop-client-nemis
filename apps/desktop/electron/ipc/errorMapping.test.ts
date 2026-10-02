import { describe, expect, it } from 'vitest';
import { ForbiddenError, IPCError, OfflineError, RateLimitedError, RemoteRejectedError } from '@nemis-desktop/shared';
import {
  DuplicateEntityError,
  EntityNotFoundError,
  QueryError,
  RepositoryError,
  TransactionFailureError,
  ValidationError,
} from '../data/errors/repositoryErrors';
import { AuthenticationUnavailableError, UnexpectedApplicationException } from '@nemis-desktop/application';
import {
  ConnectionError,
  DatabaseError,
  IntegrityError,
  MigrationError,
} from '../database/errors/errors';
import { sanitizeRemoteMessage, toIpcError } from './errorMapping';

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

describe('online-command errors', () => {
  it('maps OfflineError to OFFLINE with the fixed message', () => {
    expect(toIpcError(new OfflineError())).toEqual({
      code: 'OFFLINE',
      message: "You're offline. Connect to the internet to do this.",
    });
  });

  it('maps session-restore unavailability to OFFLINE', () => {
    expect(toIpcError(new AuthenticationUnavailableError('The NEMIS server could not be reached.')).code)
      .toBe('OFFLINE');
  });

  it("passes the server's own message through for REMOTE_REJECTED and RATE_LIMITED", () => {
    expect(toIpcError(new RemoteRejectedError(400, 'This request was withdrawn while the transfer was being completed.')))
      .toEqual({ code: 'REMOTE_REJECTED', message: 'This request was withdrawn while the transfer was being completed.' });
    expect(toIpcError(new RateLimitedError('Too many failed lookups. Try again in an hour.')))
      .toEqual({ code: 'RATE_LIMITED', message: 'Too many failed lookups. Try again in an hour.' });
  });

  it('falls back to a fixed message when the server sent none', () => {
    expect(toIpcError(new RemoteRejectedError(400))).toEqual({
      code: 'REMOTE_REJECTED',
      message: 'The server could not complete this request.',
    });
    expect(toIpcError(new RateLimitedError())).toEqual({
      code: 'RATE_LIMITED',
      message: 'Too many attempts. Please wait and try again later.',
    });
  });

  it('sanitises: control characters become spaces, whitespace collapses, length is capped at 500', () => {
    expect(sanitizeRemoteMessage('line one\nline two\u001b[31m red')).toBe('line one line two [31m red');
    const long = sanitizeRemoteMessage('x'.repeat(10_000));
    expect(long).toHaveLength(500);
    expect(long?.endsWith('…')).toBe(true);
    expect(sanitizeRemoteMessage('   \n\t ')).toBeUndefined();
    expect(sanitizeRemoteMessage(undefined)).toBeUndefined();
  });

  it('sanitises C1 controls and bidi controls to spaces', () => {
    expect(sanitizeRemoteMessage('abc')).toBe('a b c');
    expect(sanitizeRemoteMessage('a‮b‪c⁦d⁩e')).toBe('a b c d e');
  });

  it('finds an online-command error wrapped as a cause', () => {
    expect(toIpcError(new Error('wrapper', { cause: new OfflineError() })).code).toBe('OFFLINE');
  });
});
