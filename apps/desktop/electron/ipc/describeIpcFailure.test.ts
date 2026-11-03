import { describe, expect, it } from 'vitest';
import { RemoteRejectedError } from '@nemis-desktop/shared';
import { describeIpcFailure } from './describeIpcFailure';

describe('describeIpcFailure', () => {
  it('returns status, remote message and code for a RemoteRejectedError', () => {
    const error = new RemoteRejectedError(404, 'Prior record not found.', { remoteErrorCode: 'NOT_FOUND' });
    expect(describeIpcFailure(error)).toEqual({
      status: 404,
      remoteMessage: 'Prior record not found.',
      remoteErrorCode: 'NOT_FOUND',
    });
  });

  it('finds it as the cause of another error', () => {
    const inner = new RemoteRejectedError(404, 'Prior record not found.', { remoteErrorCode: 'NOT_FOUND' });
    const outer = new Error('wrapped', { cause: new Error('mid', { cause: inner }) });
    expect(describeIpcFailure(outer)).toEqual({
      status: 404,
      remoteMessage: 'Prior record not found.',
      remoteErrorCode: 'NOT_FOUND',
    });
  });

  it('returns undefined for other errors', () => {
    expect(describeIpcFailure(new Error('boom'))).toBeUndefined();
    expect(describeIpcFailure('string')).toBeUndefined();
    expect(describeIpcFailure(undefined)).toBeUndefined();
  });
});
