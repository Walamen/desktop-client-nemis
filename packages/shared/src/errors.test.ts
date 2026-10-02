import { describe, expect, it } from 'vitest';
import {
  ApplicationError,
  ConfigurationError,
  ForbiddenError,
  IPCError,
  OfflineError,
  RateLimitedError,
  RemoteRejectedError,
  toIpcErrorPayload,
} from './index';

describe('error taxonomy', () => {
  it('ApplicationError carries code, name, and message', () => {
    const err = new ApplicationError('SOME_CODE', 'boom');
    expect(err.code).toBe('SOME_CODE');
    expect(err.name).toBe('ApplicationError');
    expect(err.message).toBe('boom');
  });

  it('IPCError uses IPC_ERROR code and subclass name', () => {
    const err = new IPCError('bad channel');
    expect(err.code).toBe('IPC_ERROR');
    expect(err.name).toBe('IPCError');
    expect(err).toBeInstanceOf(ApplicationError);
  });

  it('ConfigurationError uses CONFIGURATION_ERROR code and subclass name', () => {
    const err = new ConfigurationError('bad env');
    expect(err.code).toBe('CONFIGURATION_ERROR');
    expect(err.name).toBe('ConfigurationError');
  });

  it('preserves cause when provided', () => {
    const cause = new Error('root');
    const err = new IPCError('wrapped', { cause });
    expect(err.cause).toBe(cause);
  });
});

describe('toIpcErrorPayload', () => {
  it('passes through ApplicationError codes that are part of the closed IpcErrorCode contract', () => {
    expect(toIpcErrorPayload(new IPCError('bad channel'))).toEqual({
      code: 'IPC_ERROR',
      message: 'bad channel',
    });
  });

  it('masks ApplicationError codes outside the closed IpcErrorCode contract', () => {
    expect(toIpcErrorPayload(new ConfigurationError('invalid'))).toEqual({
      code: 'UNEXPECTED_ERROR',
      message: 'An unexpected error occurred.',
    });
  });

  it('masks plain Error internals', () => {
    expect(toIpcErrorPayload(new Error('secret stack detail'))).toEqual({
      code: 'UNEXPECTED_ERROR',
      message: 'An unexpected error occurred.',
    });
  });

  it('masks non-Error thrown values', () => {
    expect(toIpcErrorPayload('boom')).toEqual({
      code: 'UNEXPECTED_ERROR',
      message: 'An unexpected error occurred.',
    });
  });
});

describe('ForbiddenError', () => {
  it('carries the FORBIDDEN code', () => {
    const error = new ForbiddenError('Setting "secret" is not renderer-readable.');
    expect(error.code).toBe('FORBIDDEN');
    expect(error.name).toBe('ForbiddenError');
  });
});

describe('online-command errors', () => {
  it('OfflineError keeps the exact text the sync worker matches on', () => {
    const error = new OfflineError();
    expect(error.code).toBe('OFFLINE');
    expect(error.message).toBe('The NEMIS server could not be reached.');
    expect(error).toBeInstanceOf(ApplicationError);
  });

  it('RemoteRejectedError keeps the transport message and status, and carries the server text separately', () => {
    const error = new RemoteRejectedError(404, 'Transfer request not found');
    expect(error.code).toBe('REMOTE_REJECTED');
    expect(error.status).toBe(404);
    expect(error.message).toBe('Provisioning request failed with status 404.');
    expect(error.remoteMessage).toBe('Transfer request not found');
  });

  it('RateLimitedError is a 429 with the server text separately', () => {
    const error = new RateLimitedError('Too many lookups. Try again in an hour.');
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.status).toBe(429);
    expect(error.message).toBe('Provisioning request failed with status 429.');
    expect(error.remoteMessage).toBe('Too many lookups. Try again in an hour.');
  });

  it('toIpcErrorPayload still masks these codes (only the main-process mapper may expose them)', () => {
    expect(toIpcErrorPayload(new RemoteRejectedError(400, 'secret')).code).toBe('UNEXPECTED_ERROR');
  });
});
