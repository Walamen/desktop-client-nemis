import { describe, expect, it } from 'vitest';
import type { DeoApplicationService } from '@nemis-desktop/application';
import { createTestApplication } from '../../testing/create-test-application';
import { DeoNotificationsViewModel } from './deo-notifications-view-model';
import {
  deoNotificationLink,
  matchesNotificationFilter,
  notificationCardType,
  notificationFilterOptions,
} from './deo-notifications-views';

describe('DEO notification helpers (same rules as portal-web lib/deo-notifications.ts)', () => {
  it.each([
    ['NEW_MESSAGE', 'MESSAGE'],
    ['REPORT_SUBMITTED', 'REPORT'],
    ['SYSTEM_ANNOUNCEMENT', 'ANNOUNCEMENT'],
    ['GENERAL_ALERT', 'ALERT'],
    ['DEO_UNASSIGNED', 'WARNING'],
    ['DEO_ASSIGNED', 'SUCCESS'],
    ['ACCOUNT_CREATED', 'INFO'],
  ])('%s shows as %s', (type, card) => {
    expect(notificationCardType(type)).toBe(card);
  });

  it.each([
    ['/messages/conv-1', '/government/deo/messages?conv=conv-1'],
    ['/deo/dashboard', '/government/deo'],
    ['/government/deo/transfers', '/government/deo/transfers'],
    ['/school-admin/dashboard', null],
    ['https://example.com', null],
    ['//evil.example/x', null],
    ['/government/deo/../county/x', null],
    ['/messages/%E0', null],
    [null, null],
  ])('maps link %p to %p', (link, route) => {
    expect(deoNotificationLink(link)).toBe(route);
  });

  it('offers All, Unread and each present card type with counts, and filters', () => {
    const items = [
      { type: 'NEW_MESSAGE', isRead: false },
      { type: 'NEW_MESSAGE', isRead: true },
      { type: 'DEO_ASSIGNED', isRead: true },
    ];
    expect(notificationFilterOptions(items, { total: 3, unread: 1 })).toEqual([
      { value: 'ALL', label: 'All', count: 3 },
      { value: 'UNREAD', label: 'Unread', count: 1 },
      { value: 'MESSAGE', label: 'Message', count: 2 },
      { value: 'SUCCESS', label: 'Success', count: 1 },
    ]);
    expect(items.filter((item) => matchesNotificationFilter(item, 'UNREAD'))).toHaveLength(1);
    expect(items.filter((item) => matchesNotificationFilter(item, 'SUCCESS'))).toHaveLength(1);
  });
});

describe('DeoNotificationsViewModel', () => {
  it('loads, and reloads after marking one or all read', async () => {
    const { app } = createTestApplication();
    const vm = new DeoNotificationsViewModel({ deo: app.deo });
    const loading = vm.load();
    expect(vm.store.getState().notifications.status).toBe('loading');
    await loading;
    expect(vm.store.getState().notifications.status).toBe('success');
    await vm.markRead('n-unknown');
    await vm.markAllRead();
    expect(vm.store.getState().notifications.status).toBe('success');
  });

  it('moves to error when the service fails', async () => {
    const failing = {
      listNotifications: async () => {
        throw new Error('database locked');
      },
    } as unknown as DeoApplicationService;
    const vm = new DeoNotificationsViewModel({ deo: failing });
    await vm.load();
    expect(vm.store.getState().notifications.status).toBe('error');
  });
});
