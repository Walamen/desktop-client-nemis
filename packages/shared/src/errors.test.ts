import { describe, expect, it } from 'vitest';
import { ApplicationError, ConfigurationError, IPCError, toIpcErrorPayload } from './index';

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
  it('passes through ApplicationError code and message', () => {
    expect(toIpcErrorPayload(new ConfigurationError('invalid'))).toEqual({
      code: 'CONFIGURATION_ERROR',
      message: 'invalid',
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
