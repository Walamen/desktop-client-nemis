import { describe, expect, it } from 'vitest';
import { UseCaseException, ok } from '@nemis-desktop/application';
import { NotificationStore } from '../stores/notification-store';
import { OperationFailedError, LoadingError } from '../errors';
import { idleState, type AsyncState } from './async-state';
import { executeCommand, trackQuery } from './async-runner';

function makeAccess<T>() {
  let state: AsyncState<T> = idleState<T>();
  const transitions: string[] = [];
  return {
    access: {
      get: () => state,
      set: (next: AsyncState<T>) => {
        state = next;
        transitions.push(next.status);
      },
    },
    read: () => state,
    transitions,
  };
}

describe('trackQuery', () => {
  it('goes loading → success and maps the DTO', async () => {
    const { access, read, transitions } = makeAccess<string>();
    await trackQuery({
      access,
      fetch: () => Promise.resolve(ok(21)),
      map: (n) => `n=${n * 2}`,
    });
    expect(transitions).toEqual(['loading', 'success']);
    expect(read()).toEqual({ status: 'success', data: 'n=42' });
  });

  it('goes refreshing when data already exists', async () => {
    const { access, transitions } = makeAccess<string>();
    access.set({ status: 'success', data: 'old' });
    await trackQuery({ access, fetch: () => Promise.resolve(ok(1)), map: String });
    expect(transitions.slice(1)).toEqual(['refreshing', 'success']);
  });

  it('maps null data and isEmpty views to empty', async () => {
    const a = makeAccess<string>();
    await trackQuery({
      access: a.access,
      fetch: () => Promise.resolve(ok<number | null>(null)),
      map: String,
    });
    expect(a.read().status).toBe('empty');

    const b = makeAccess<readonly number[]>();
    await trackQuery({
      access: b.access,
      fetch: () => Promise.resolve(ok<readonly number[]>([])),
      map: (xs) => xs,
      isEmpty: (xs) => xs.length === 0,
    });
    expect(b.read().status).toBe('empty');
  });

  it('translates thrown errors into error state and calls onData before map', async () => {
    const { access, read } = makeAccess<string>();
    await trackQuery({
      access,
      fetch: () => Promise.reject(new Error('boom')),
      map: String,
    });
    const state = read();
    expect(state.status).toBe('error');
    if (state.status === 'error') expect(state.error).toBeInstanceOf(LoadingError);

    const seen: number[] = [];
    const other = makeAccess<string>();
    await trackQuery({
      access: other.access,
      fetch: () => Promise.resolve(ok(7)),
      map: (n) => {
        seen.push(100 + n);
        return String(n);
      },
      onData: (n) => seen.push(n),
    });
    expect(seen).toEqual([7, 107]);
  });
});

describe('executeCommand', () => {
  it('returns ok with mapped view and notifies success plus warnings', async () => {
    const notifications = new NotificationStore();
    const outcome = await executeCommand({
      run: () => Promise.resolve(ok(5, ['heads up'])),
      map: (n: number) => n * 2,
      notifications,
      successMessage: 'Saved.',
    });
    expect(outcome).toEqual({ ok: true, data: 10 });
    const kinds = notifications.store.getState().notifications.map((n) => n.kind);
    expect(kinds).toEqual(['success', 'warning']);
  });

  it('returns the translated error and notifies with its userMessage', async () => {
    const notifications = new NotificationStore();
    const outcome = await executeCommand({
      run: () => Promise.reject(new UseCaseException('Grade is not publishable')),
      map: (n: number) => n,
      notifications,
      successMessage: 'Saved.',
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toBeInstanceOf(OperationFailedError);
    const first = notifications.store.getState().notifications[0];
    expect(first?.kind).toBe('error');
    expect(first?.message).toBe('Grade is not publishable');
  });
});
