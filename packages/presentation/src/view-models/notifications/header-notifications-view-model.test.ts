import { describe, expect, it } from 'vitest';
import type { HeaderNotification } from '@nemis-desktop/types';
import { createTestApplication } from '../../testing/create-test-application';
import { HeaderNotificationsViewModel } from './header-notifications-view-model';

const note = (id: string): HeaderNotification =>
  ({ id, title: `T ${id}`, message: `M ${id}`, createdAt: '2026-10-22T10:00:00.000Z', isRead: false }) as unknown as HeaderNotification;

describe('HeaderNotificationsViewModel', () => {
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
});
