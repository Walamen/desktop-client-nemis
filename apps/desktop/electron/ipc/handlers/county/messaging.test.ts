import { describe, expect, it, vi } from 'vitest';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcChannel } from '@nemis-desktop/types';
import { IPCError } from '@nemis-desktop/shared';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import { registerCountyMessagingHandlers, type CountyMessagingGateway } from './messaging';
import { registerCountyNotificationHandlers } from './notifications';

interface Captured {
  validate: IpcValidator;
  handler: (...args: readonly unknown[]) => unknown;
}

function setup() {
  const calls = new Map<string, Captured>();
  const handle = ((channel: IpcChannel, validate: IpcValidator, handler: unknown) => {
    calls.set(channel, { validate, handler: handler as Captured['handler'] });
  }) as IpcHandle;
  const county = {
    getMessagingOverview: vi.fn(async () => ({ data: { recipients: [], conversations: [] } })),
    listDirectMessages: vi.fn(async () => ({ data: [] })),
    listNotifications: vi.fn(async () => ({ data: { items: [] } })),
    markNotificationRead: vi.fn(async () => ({ data: true })),
    markAllNotificationsRead: vi.fn(async () => ({ data: 3 })),
  };
  const gateway: CountyMessagingGateway = {
    startDirectConversation: vi.fn(async () => null),
    sendDirectMessage: vi.fn(async () => null),
    markDirectConversationRead: vi.fn(async () => null),
  };
  const refresh = vi.fn(async () => true);
  const presence = { onlineUsers: vi.fn(async (ids: string[]) => ids.slice(0, 1)) };
  const app = { county } as unknown as ApplicationLayer;
  registerCountyMessagingHandlers(handle, app, gateway, refresh, presence);
  registerCountyNotificationHandlers(handle, app);
  const call = (channel: string, ...args: unknown[]) => {
    const captured = calls.get(channel)!;
    captured.validate(args);
    return captured.handler(...args);
  };
  return { county, gateway, refresh, presence, call };
}

describe('county messaging channels', () => {
  it('reads forward to the County application service', async () => {
    const { county, call } = setup();
    expect(await call('county:messaging-overview')).toEqual({ recipients: [], conversations: [] });
    expect(await call('county:messaging-messages', 'c-1')).toEqual([]);
    expect(county.listDirectMessages).toHaveBeenCalledWith('c-1');
  });

  it('commands run online and then refresh', async () => {
    const { gateway, refresh, call } = setup();
    expect(await call('county:messaging-send', { conversationId: 'c-1', content: '  Hello  ' })).toEqual({
      data: null,
      refreshed: true,
    });
    expect(gateway.sendDirectMessage).toHaveBeenCalledWith({ conversationId: 'c-1', content: 'Hello' });
    await call('county:messaging-start', { targetUserId: 'deo-1', initialMessage: 'Hi' });
    expect(gateway.startDirectConversation).toHaveBeenCalledWith({ targetUserId: 'deo-1', initialMessage: 'Hi' });
    await call('county:messaging-mark-read', 'c-1');
    expect(gateway.markDirectConversationRead).toHaveBeenCalledWith('c-1');
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('online users come from the live socket', async () => {
    const { presence, call } = setup();
    expect(await call('messaging:online-users', ['a', 'b'])).toEqual(['a']);
    expect(presence.onlineUsers).toHaveBeenCalledWith(['a', 'b']);
  });

  it('refuses blank or oversized messages, unknown keys and bad id lists', () => {
    const { call } = setup();
    expect(() => call('county:messaging-send', { conversationId: 'c-1', content: '   ' })).toThrow(IPCError);
    expect(() => call('county:messaging-send', { conversationId: 'c-1', content: 'x'.repeat(5001) })).toThrow(IPCError);
    expect(() => call('county:messaging-send', { conversationId: 'c-1', content: 'ok', extra: 1 })).toThrow(IPCError);
    expect(() => call('county:messaging-start', { targetUserId: '', initialMessage: 'Hi' })).toThrow(IPCError);
    expect(() => call('county:messaging-mark-read')).toThrow(IPCError);
    expect(() => call('messaging:online-users', 'a')).toThrow(IPCError);
    expect(() => call('messaging:online-users', [1])).toThrow(IPCError);
    expect(() => call('messaging:online-users', Array.from({ length: 501 }, (_, i) => `u-${i}`))).toThrow(IPCError);
  });
});

describe('county notification channels', () => {
  it('list and marks forward to the County application service', async () => {
    const { county, call } = setup();
    const query = { filter: 'UNREAD', page: 2, limit: 20 };
    await call('county:notifications-list', query);
    expect(county.listNotifications).toHaveBeenCalledWith(query);
    expect(await call('county:notifications-mark-read', 'n-1')).toBe(true);
    expect(await call('county:notifications-mark-all-read')).toBe(3);
  });

  it('refuses a bad filter or page size', () => {
    const { call } = setup();
    expect(() => call('county:notifications-list', { filter: 'NEW', page: 1, limit: 20 })).toThrow(IPCError);
    expect(() => call('county:notifications-list', { filter: 'ALL', page: 1, limit: 51 })).toThrow(IPCError);
    expect(() => call('county:notifications-mark-all-read', 'x')).toThrow(IPCError);
  });
});
