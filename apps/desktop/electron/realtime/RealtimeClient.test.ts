import { describe, expect, it, vi } from 'vitest';
import type { RealtimeEvent } from '@nemis-desktop/types';
import { RealtimeClient, type RealtimeDeps, type SocketLike } from './RealtimeClient';

class FakeSocket implements SocketLike {
  connected = false;
  handlers = new Map<string, ((...args: unknown[]) => void)[]>();
  emitted: unknown[][] = [];
  disconnected = false;
  on(event: string, listener: (...args: unknown[]) => void): void {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), listener]);
  }
  emit(event: string, ...args: unknown[]): void {
    this.emitted.push([event, ...args]);
  }
  disconnect(): void {
    this.disconnected = true;
    this.connected = false;
  }
  fire(event: string, ...args: unknown[]): void {
    if (event === 'connect') this.connected = true;
    for (const listener of this.handlers.get(event) ?? []) listener(...args);
  }
}

function setup(opts: { shouldRun?: boolean } = {}) {
  const sockets: FakeSocket[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  const events: RealtimeEvent[] = [];
  let run = opts.shouldRun ?? true;
  const deps: RealtimeDeps = {
    connect: vi.fn(() => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    }),
    getCookie: vi.fn(async () => 'sid=s; access_token=a'),
    pullNow: vi.fn(async () => true),
    emit: (event) => events.push(event),
    shouldRun: () => run,
    setTimer: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimer: vi.fn(),
  };
  const client = new RealtimeClient('https://nemis.example/', deps);
  return { client, deps, sockets, timers, events, setRun: (value: boolean) => (run = value) };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('RealtimeClient', () => {
  it('connects to the notifications namespace with the session cookie', async () => {
    const { client, deps } = setup();
    await client.tick();
    expect(deps.connect).toHaveBeenCalledWith('https://nemis.example/notifications', {
      path: '/socket.io',
      transports: ['websocket'],
      extraHeaders: { cookie: 'sid=s; access_token=a' },
      reconnection: false,
    });
    await client.tick();
    expect(deps.connect).toHaveBeenCalledTimes(1);
  });

  it('does not connect when it should not run, and disconnects when that changes', async () => {
    const { client, deps, sockets, setRun } = setup({ shouldRun: false });
    await client.tick();
    expect(deps.connect).not.toHaveBeenCalled();
    setRun(true);
    await client.tick();
    sockets[0]!.fire('connect');
    setRun(false);
    await client.tick();
    expect(sockets[0]!.disconnected).toBe(true);
  });

  it('new-message triggers a pull then emits message', async () => {
    const { client, deps, sockets, events } = setup();
    await client.tick();
    sockets[0]!.fire('connect');
    sockets[0]!.fire('new-message', { conversationId: 'c-1', content: 'Hi' });
    await flush();
    expect(deps.pullNow).toHaveBeenCalledTimes(1);
    expect(events).toEqual([{ type: 'message', conversationId: 'c-1' }]);
  });

  it('a notification triggers a pull then emits notification', async () => {
    const { client, deps, sockets, events } = setup();
    await client.tick();
    sockets[0]!.fire('new-notification', { id: 'n-1' });
    await flush();
    expect(deps.pullNow).toHaveBeenCalledTimes(1);
    expect(events).toEqual([{ type: 'notification' }]);
  });

  it('presence events are forwarded', async () => {
    const { client, sockets, events } = setup();
    await client.tick();
    sockets[0]!.fire('user-online', { userId: 'deo-1' });
    sockets[0]!.fire('user-offline', { userId: 'deo-1' });
    expect(events).toEqual([
      { type: 'presence', userId: 'deo-1', online: true },
      { type: 'presence', userId: 'deo-1', online: false },
    ]);
  });

  it('connect errors back off and refetch the cookie', async () => {
    const { client, deps, sockets, timers } = setup();
    await client.tick();
    sockets[0]!.fire('connect_error', new Error('jwt expired'));
    expect(timers.map((t) => t.ms)).toEqual([2000]);
    timers[0]!.fn();
    await flush();
    expect(deps.getCookie).toHaveBeenCalledTimes(2);
    sockets[1]!.fire('connect_error', new Error('jwt expired'));
    timers[1]!.fn();
    await flush();
    sockets[2]!.fire('connect_error', new Error('down'));
    expect(timers.map((t) => t.ms)).toEqual([2000, 4000, 8000]);
    // A tick while a retry is scheduled does not open a second socket.
    await client.tick();
    expect(deps.connect).toHaveBeenCalledTimes(3);
    // A successful connection resets the backoff for the next drop.
    timers[2]!.fn();
    await flush();
    sockets[3]!.fire('connect');
    sockets[3]!.fire('disconnect', 'transport close');
    expect(timers.at(-1)!.ms).toBe(2000);
  });

  it('the backoff never exceeds 60 seconds', async () => {
    const { client, sockets, timers } = setup();
    await client.tick();
    for (let i = 0; i < 8; i += 1) {
      sockets.at(-1)!.fire('connect_error', new Error('down'));
      timers.at(-1)!.fn();
      await flush();
    }
    expect(Math.max(...timers.map((t) => t.ms))).toBe(60_000);
  });

  it('stop disconnects and cancels retries', async () => {
    const { client, deps, sockets, timers } = setup();
    await client.tick();
    sockets[0]!.fire('connect_error', new Error('down'));
    client.stop();
    expect(deps.clearTimer).toHaveBeenCalled();
    expect(sockets[0]!.disconnected).toBe(true);
    timers[0]!.fn();
    await flush();
    expect(deps.connect).toHaveBeenCalledTimes(1);
  });

  it('onlineUsers asks get-online-users and returns the ack; offline it is empty', async () => {
    const { client, sockets } = setup();
    expect(await client.onlineUsers(['a'])).toEqual([]);
    await client.tick();
    sockets[0]!.fire('connect');
    const pending = client.onlineUsers(['a', 'b']);
    const [event, ids, ack] = sockets[0]!.emitted[0] as [string, string[], (online: string[]) => void];
    expect([event, ids]).toEqual(['get-online-users', ['a', 'b']]);
    ack(['b']);
    expect(await pending).toEqual(['b']);
  });
});
