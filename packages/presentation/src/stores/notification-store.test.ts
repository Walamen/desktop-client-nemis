import { describe, expect, it } from 'vitest';
import { NotificationStore } from './notification-store';

describe('NotificationStore', () => {
  it('appends notifications with per-kind auto-dismiss defaults', () => {
    const store = new NotificationStore();
    store.success('Saved.');
    store.error('Failed.');
    const { notifications } = store.store.getState();
    expect(notifications).toHaveLength(2);
    expect(notifications[0]?.kind).toBe('success');
    expect(notifications[0]?.autoDismissMs).toBe(4000);
    expect(notifications[1]?.autoDismissMs).toBeNull();
  });

  it('honours constructor overrides and per-call overrides', () => {
    const store = new NotificationStore({ success: 1000 });
    store.success('a');
    store.notify('warning', 'b', { autoDismissMs: null });
    const { notifications } = store.store.getState();
    expect(notifications[0]?.autoDismissMs).toBe(1000);
    expect(notifications[1]?.autoDismissMs).toBeNull();
  });

  it('dismisses by id and clears', () => {
    const store = new NotificationStore();
    const id = store.info('hello');
    store.warning('there');
    store.dismiss(id);
    expect(store.store.getState().notifications).toHaveLength(1);
    store.clear();
    expect(store.store.getState().notifications).toHaveLength(0);
  });
});
