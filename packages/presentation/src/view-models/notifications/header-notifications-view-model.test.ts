import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HeaderNotification } from '@nemis-desktop/types';
import { createTestApplication } from '../../testing/create-test-application';
import { HeaderNotificationsViewModel } from './header-notifications-view-model';

const note = (id: string): HeaderNotification => ({
  id,
  type: 'SYSTEM',
  title: `T ${id}`,
  message: `M ${id}`,
  link: null,
  createdAt: '2026-10-22T10:00:00.000Z',
});

describe('HeaderNotificationsViewModel', () => {
  afterEach(() => vi.restoreAllMocks());

  it('loads the summary', async () => {
    const { app, ports } = createTestApplication();
    const a = note('a');
    const b = note('b');
    ports.headerNotifications.summaries.set(ports.currentUserId, { unread: 2, recent: [a, b] });
    const vm = new HeaderNotificationsViewModel({ identity: app.identity });
    await vm.load();
    expect(vm.store.getState()).toMatchObject({ status: 'ready', unread: 2, recent: [a, b] });
  });

  it('keeps the last summary when a reload fails', async () => {
    const { app, ports } = createTestApplication();
    ports.headerNotifications.summaries.set(ports.currentUserId, { unread: 2, recent: [note('a')] });
    const vm = new HeaderNotificationsViewModel({ identity: app.identity });
    await vm.load();
    ports.headerNotifications.summary = () => {
      throw new Error('boom');
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(vm.load()).resolves.toBeUndefined();
    expect(vm.store.getState()).toMatchObject({ status: 'error', unread: 2 });
  });

  it('does not drop to loading during a reload', async () => {
    const { app, ports } = createTestApplication();
    ports.headerNotifications.summaries.set(ports.currentUserId, { unread: 1, recent: [note('a')] });
    const vm = new HeaderNotificationsViewModel({ identity: app.identity });
    await vm.load();
    const second = vm.load();
    expect(vm.store.getState().status).not.toBe('loading');
    await second;
  });

  it('ignores an older response that arrives after a newer one', async () => {
    const { app } = createTestApplication();
    const resolvers: Array<(v: { data: { unread: number; recent: HeaderNotification[] } }) => void> = [];
    vi.spyOn(app.identity, 'getHeaderNotifications').mockImplementation(
      () => new Promise((resolve) => resolvers.push(resolve as (typeof resolvers)[number])) as never,
    );
    const vm = new HeaderNotificationsViewModel({ identity: app.identity });
    const first = vm.load();
    const second = vm.load();
    resolvers[1]!({ data: { unread: 5, recent: [note('new')] } });
    await second;
    resolvers[0]!({ data: { unread: 1, recent: [note('old')] } });
    await first;
    expect(vm.store.getState()).toMatchObject({ status: 'ready', unread: 5, recent: [note('new')] });
  });

  it('logs a failed load', async () => {
    const { app } = createTestApplication();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = new Error('boom');
    vi.spyOn(app.identity, 'getHeaderNotifications').mockRejectedValue(boom);
    const vm = new HeaderNotificationsViewModel({ identity: app.identity });
    await vm.load();
    expect(spy).toHaveBeenCalledWith('Header notifications failed to load', boom);
  });
});
