import { describe, expect, it } from 'vitest';
import type { CountyDirectConversation, CountyMessageRecipient, CountyNotification } from '@nemis-desktop/types';
import { createTestApplication } from '../../testing/create-test-application';
import { CountyMessagesViewModel } from './county-messages-view-model';
import { CountyNotificationsViewModel } from './county-notifications-view-model';

const recipient = (userId: string): CountyMessageRecipient => ({
  userId, firstName: 'James', lastName: 'Doe', photoUrl: null, role: 'DEO',
  districtId: 'd-1', districtName: 'Buchanan', institutionId: null, institutionName: null,
});
const conversation = (id: string, userId: string): CountyDirectConversation => ({
  id, lastMessageAt: '2026-10-20T10:00:00.000Z', createdAt: '2026-10-01T00:00:00.000Z',
  counterpart: { userId, firstName: 'James', lastName: 'Doe', photoUrl: null, role: 'DEO', institutionName: null },
  lastMessage: 'Hi', unreadCount: 1,
});
const notification = (id: string, isRead = false): CountyNotification => ({
  id, type: 'SYSTEM_ANNOUNCEMENT', title: id, message: id, isRead, link: null, createdAt: '2026-10-20T00:00:00.000Z',
});

describe('CountyMessagesViewModel', () => {
  it('select loads the thread for a conversation; a pending recipient has no thread', async () => {
    const { app, ports } = createTestApplication();
    ports.countyMessaging.messagesByConversation.set('c-1', []);
    const vm = new CountyMessagesViewModel({ county: app.county });
    await vm.select(recipient('deo-1'), 'c-1');
    expect(vm.store.getState()).toMatchObject({ selectedConversationId: 'c-1', pendingRecipient: null });
    expect(vm.store.getState().messages).toEqual({ status: 'success', data: [] });
    await vm.select(recipient('deo-2'), null);
    expect(vm.store.getState()).toMatchObject({ selectedConversationId: null, pendingRecipient: { userId: 'deo-2' } });
    expect(vm.store.getState().messages.status).toBe('idle');
  });

  it('after a conversation is started, selecting by user opens it', async () => {
    const { app, ports } = createTestApplication();
    const vm = new CountyMessagesViewModel({ county: app.county });
    await vm.select(recipient('deo-1'), null);
    ports.countyMessaging.overview = { recipients: [recipient('deo-1')], conversations: [conversation('c-9', 'deo-1')] };
    ports.countyMessaging.messagesByConversation.set('c-9', []);
    await vm.loadOverview();
    await vm.selectByUserId('deo-1');
    expect(vm.store.getState()).toMatchObject({ selectedConversationId: 'c-9', pendingRecipient: null });
  });

  it('a message event reloads the overview and the open thread', async () => {
    const { app, ports } = createTestApplication();
    ports.countyMessaging.messagesByConversation.set('c-1', []);
    const vm = new CountyMessagesViewModel({ county: app.county });
    await vm.select(recipient('deo-1'), 'c-1');
    ports.countyMessaging.overview = { recipients: [], conversations: [conversation('c-1', 'deo-1')] };
    ports.countyMessaging.messagesByConversation.set('c-1', [
      { id: 'm-1', conversationId: 'c-1', senderId: 'deo-1', content: 'New', isRead: false, readAt: null,
        createdAt: '2026-10-20T10:00:00.000Z', isOwn: false, senderName: 'James Doe' },
    ]);
    await vm.onRealtime({ type: 'message', conversationId: 'c-1' });
    const state = vm.store.getState();
    expect(state.overview.status).toBe('success');
    expect(state.messages.status === 'success' && state.messages.data?.map((m) => m.id)).toEqual(['m-1']);
  });

  it('presence: online ids are replaced, then events add and remove', async () => {
    const { app } = createTestApplication();
    const vm = new CountyMessagesViewModel({ county: app.county });
    vm.setOnlineUsers(['a', 'b']);
    await vm.onRealtime({ type: 'presence', userId: 'c', online: true });
    await vm.onRealtime({ type: 'presence', userId: 'a', online: false });
    expect(vm.store.getState().onlineUserIds).toEqual(['b', 'c']);
  });
});

describe('CountyNotificationsViewModel', () => {
  it('filter resets paging; load more appends', async () => {
    const { app, ports } = createTestApplication();
    ports.countyNotifications.page = {
      items: [notification('n-1')], total: 21, totalAll: 30, unread: 21, alertsUnresolved: 2, page: 1, limit: 20,
    };
    const vm = new CountyNotificationsViewModel({ county: app.county });
    await vm.load('UNREAD');
    expect(ports.countyNotifications.lastQuery!.query).toEqual({ filter: 'UNREAD', page: 1, limit: 20 });
    ports.countyNotifications.page = { ...ports.countyNotifications.page, items: [notification('n-2')], page: 2 };
    await vm.loadMore();
    expect(ports.countyNotifications.lastQuery!.query).toEqual({ filter: 'UNREAD', page: 2, limit: 20 });
    expect(vm.store.getState().items.map((n) => n.id)).toEqual(['n-1', 'n-2']);
    expect(vm.store.getState()).toMatchObject({ total: 21, totalAll: 30, unread: 21, alertsUnresolved: 2, hasMore: true });
    await vm.load('ALL');
    expect(ports.countyNotifications.lastQuery!.query).toEqual({ filter: 'ALL', page: 1, limit: 20 });
  });

  it('mark read flips the item and refreshes the counts; under Unread it leaves the list', async () => {
    const { app, ports } = createTestApplication();
    ports.countyNotifications.owned.set('usr-1', new Set(['n-1']));
    ports.countyNotifications.page = {
      items: [notification('n-1'), notification('n-2')], total: 2, totalAll: 2, unread: 2, alertsUnresolved: 0, page: 1, limit: 20,
    };
    const vm = new CountyNotificationsViewModel({ county: app.county });
    await vm.load('ALL');
    ports.countyNotifications.page = { ...ports.countyNotifications.page, unread: 1 };
    await vm.markRead('n-1');
    expect(vm.store.getState().items.find((n) => n.id === 'n-1')!.isRead).toBe(true);
    expect(vm.store.getState().unread).toBe(1);
    await vm.load('UNREAD');
    await vm.markRead('n-2');
    expect(vm.store.getState().items.map((n) => n.id)).not.toContain('n-2');
  });

  it('mark all read flips every item', async () => {
    const { app, ports } = createTestApplication();
    ports.countyNotifications.page = {
      items: [notification('n-1'), notification('n-2')], total: 2, totalAll: 2, unread: 2, alertsUnresolved: 0, page: 1, limit: 20,
    };
    const vm = new CountyNotificationsViewModel({ county: app.county });
    await vm.load('ALL');
    await vm.markAllRead();
    expect(vm.store.getState().items.every((n) => n.isRead)).toBe(true);
  });
});
