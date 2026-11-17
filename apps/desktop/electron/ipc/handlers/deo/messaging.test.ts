import { describe, expect, it, vi } from 'vitest';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcChannel } from '@nemis-desktop/types';
import { IPCError } from '@nemis-desktop/shared';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import type { CountyMessagingGateway } from '../county/messaging';
import { registerDeoMessagingHandlers } from './messaging';

interface Captured {
  validate: IpcValidator;
  handler: (...args: readonly unknown[]) => unknown;
}

function setup() {
  const calls = new Map<string, Captured>();
  const handle = ((channel: IpcChannel, validate: IpcValidator, handler: unknown) => {
    calls.set(channel, { validate, handler: handler as Captured['handler'] });
  }) as IpcHandle;
  const deo = {
    getMessagingOverview: vi.fn(async () => ({ data: { recipients: [], conversations: [] } })),
    listDirectMessages: vi.fn(async () => ({ data: [] })),
    listNotifications: vi.fn(async () => ({ data: { items: [], unread: 0 } })),
    markNotificationRead: vi.fn(async () => ({ data: true })),
    markAllNotificationsRead: vi.fn(async () => ({ data: 3 })),
  };
  const gateway: CountyMessagingGateway = {
    startDirectConversation: vi.fn(async () => null),
    sendDirectMessage: vi.fn(async () => null),
    markDirectConversationRead: vi.fn(async () => null),
  };
  const refresh = vi.fn(async () => true);
  registerDeoMessagingHandlers(handle, { deo } as unknown as ApplicationLayer, gateway, refresh);
  const call = (channel: string, ...args: unknown[]) => {
    const captured = calls.get(channel)!;
    captured.validate(args);
    return captured.handler(...args);
  };
  return { deo, gateway, refresh, call };
}

describe('deo messaging channels', () => {
  it('reads forward to the DEO application service', async () => {
    const { deo, call } = setup();
    expect(await call('deo:messaging-overview')).toEqual({ recipients: [], conversations: [] });
    expect(await call('deo:messaging-messages', 'c-1')).toEqual([]);
    expect(deo.listDirectMessages).toHaveBeenCalledWith('c-1');
  });

  it('commands run online and then refresh', async () => {
    const { gateway, refresh, call } = setup();
    expect(await call('deo:messaging-send', { conversationId: 'c-1', content: '  Hello  ' })).toEqual({
      data: null,
      refreshed: true,
    });
    expect(gateway.sendDirectMessage).toHaveBeenCalledWith({ conversationId: 'c-1', content: 'Hello' });
    await call('deo:messaging-start', { targetUserId: 'ceo-1', initialMessage: ' Hi ' });
    expect(gateway.startDirectConversation).toHaveBeenCalledWith({ targetUserId: 'ceo-1', initialMessage: 'Hi' });
    await call('deo:messaging-mark-read', 'c-1');
    expect(gateway.markDirectConversationRead).toHaveBeenCalledWith('c-1');
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('notifications list, mark one and mark all; list takes no arguments', async () => {
    const { deo, call } = setup();
    expect(await call('deo:notifications-list')).toEqual({ items: [], unread: 0 });
    expect(await call('deo:notifications-mark-read', 'n-1')).toBe(true);
    expect(deo.markNotificationRead).toHaveBeenCalledWith('n-1');
    expect(await call('deo:notifications-mark-all-read')).toBe(3);
    expect(() => call('deo:notifications-list', { filter: 'ALL' })).toThrow(IPCError);
  });

  it('refuses blank or oversized messages and missing ids', () => {
    const { call } = setup();
    expect(() => call('deo:messaging-send', { conversationId: 'c-1', content: '   ' })).toThrow(IPCError);
    expect(() => call('deo:messaging-send', { conversationId: 'c-1', content: 'x'.repeat(5001) })).toThrow(IPCError);
    expect(() => call('deo:messaging-start', { targetUserId: '', initialMessage: 'Hi' })).toThrow(IPCError);
    expect(() => call('deo:messaging-mark-read')).toThrow(IPCError);
    expect(() => call('deo:notifications-mark-read')).toThrow(IPCError);
  });
});
