import { describe, expect, it } from 'vitest';
import { hasData, idleState, isBusy, toViewStatus, type AsyncState } from './async-state';

describe('AsyncState', () => {
  it('idleState creates idle', () => {
    expect(idleState<number>()).toEqual({ status: 'idle' });
  });

  it('hasData narrows success and refreshing', () => {
    const success: AsyncState<number> = { status: 'success', data: 4 };
    const refreshing: AsyncState<number> = { status: 'refreshing', data: 2 };
    expect(hasData(success) && success.data).toBe(4);
    expect(hasData(refreshing) && refreshing.data).toBe(2);
    expect(hasData({ status: 'loading' })).toBe(false);
  });

  it('isBusy is true only for loading and refreshing', () => {
    expect(isBusy({ status: 'loading' })).toBe(true);
    expect(isBusy({ status: 'refreshing', data: 1 })).toBe(true);
    expect(isBusy({ status: 'idle' })).toBe(false);
  });

  it('toViewStatus passes the base status through by default', () => {
    expect(toViewStatus({ status: 'success', data: 1 })).toBe('success');
  });

  it('toViewStatus reports offline when offline and nothing is shown', () => {
    expect(toViewStatus({ status: 'idle' }, { isOffline: true, isSyncing: false })).toBe('offline');
    expect(
      toViewStatus(
        { status: 'error', error: { kind: 'loading', userMessage: 'x' } },
        { isOffline: true, isSyncing: false },
      ),
    ).toBe('offline');
    // data on screen wins over the offline badge
    expect(
      toViewStatus({ status: 'success', data: 1 }, { isOffline: true, isSyncing: false }),
    ).toBe('success');
  });

  it('toViewStatus reports syncing while data is shown during a sync', () => {
    expect(
      toViewStatus({ status: 'success', data: 1 }, { isOffline: false, isSyncing: true }),
    ).toBe('syncing');
    expect(toViewStatus({ status: 'loading' }, { isOffline: false, isSyncing: true })).toBe(
      'loading',
    );
  });
});
