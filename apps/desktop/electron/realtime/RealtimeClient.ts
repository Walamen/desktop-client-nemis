import type { RealtimeEvent } from '@nemis-desktop/types';

/** The part of a socket.io client socket this uses (a fake in tests). */
export interface SocketLike {
  readonly connected: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- socket.io listeners take event-specific payloads
  on(event: string, listener: (...args: any[]) => void): void;
  emit(event: string, ...args: unknown[]): void;
  disconnect(): void;
}

export interface RealtimeConnectOptions {
  path: string;
  transports: string[];
  extraHeaders: Record<string, string>;
  reconnection: false;
}

export interface RealtimeDeps {
  connect(url: string, options: RealtimeConnectOptions): SocketLike;
  /** A fresh session cookie header (restores the session; main process only). */
  getCookie(): Promise<string>;
  /** A delta pull; the pull is the only writer of local truth. */
  pullNow(): Promise<boolean>;
  /** Forwards an event to the renderer (`nemis:event`). */
  emit(event: RealtimeEvent): void;
  /** Signed in to a County workspace and online. */
  shouldRun(): boolean;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

const FIRST_RETRY_MS = 2_000;
const MAX_RETRY_MS = 60_000;
const PRESENCE_TIMEOUT_MS = 5_000;

/**
 * The live connection to the server's /notifications socket (the same one
 * portal-web uses): new messages and notifications trigger a pull and then
 * tell the renderer; presence is forwarded. Reconnection is ours, not
 * socket.io's, so every attempt carries a freshly restored session cookie,
 * with a 2 s → 60 s backoff. `tick()` is idempotent and is driven by the sync
 * timer and the network-reconnect callback.
 */
export class RealtimeClient {
  readonly #url: string;
  readonly #deps: RealtimeDeps;
  #socket: SocketLike | null = null;
  #connecting = false;
  #retry: unknown = null;
  #failures = 0;
  #generation = 0;
  #pulling: Promise<void> | null = null;
  #pullAgain = false;

  constructor(apiBaseUrl: string, deps: RealtimeDeps) {
    this.#url = new URL('/notifications', apiBaseUrl).toString();
    this.#deps = deps;
  }

  async tick(): Promise<void> {
    if (!this.#deps.shouldRun()) {
      this.stop();
      return;
    }
    if (this.#socket || this.#connecting || this.#retry !== null) return;
    await this.#connect(this.#generation);
  }

  stop(): void {
    this.#generation += 1;
    if (this.#retry !== null) {
      this.#deps.clearTimer(this.#retry);
      this.#retry = null;
    }
    const socket = this.#socket;
    this.#socket = null;
    this.#connecting = false;
    this.#failures = 0;
    socket?.disconnect();
  }

  /** Of these users, the ones the server says are online; [] when not connected. */
  onlineUsers(userIds: string[]): Promise<string[]> {
    const socket = this.#socket;
    if (!socket?.connected || userIds.length === 0) return Promise.resolve([]);
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve([]), PRESENCE_TIMEOUT_MS);
      socket.emit('get-online-users', userIds, (online: unknown) => {
        clearTimeout(timeout);
        resolve(Array.isArray(online) ? online.filter((id): id is string => typeof id === 'string') : []);
      });
    });
  }

  async #connect(generation: number): Promise<void> {
    this.#connecting = true;
    let cookie: string;
    try {
      cookie = await this.#deps.getCookie();
    } catch {
      this.#connecting = false;
      if (generation === this.#generation) this.#scheduleRetry(generation);
      return;
    }
    this.#connecting = false;
    if (generation !== this.#generation || !this.#deps.shouldRun()) return;
    const socket = this.#deps.connect(this.#url, {
      path: '/socket.io',
      transports: ['websocket'],
      extraHeaders: { cookie },
      reconnection: false,
    });
    this.#socket = socket;
    const current = () => this.#socket === socket;
    socket.on('connect', () => {
      if (current()) this.#failures = 0;
    });
    socket.on('connect_error', () => {
      if (current()) this.#dropAndRetry(socket, generation);
    });
    socket.on('disconnect', () => {
      if (current()) this.#dropAndRetry(socket, generation);
    });
    socket.on('new-message', (payload: { conversationId?: unknown }) => {
      const conversationId = typeof payload?.conversationId === 'string' ? payload.conversationId : '';
      void this.#pullThen({ type: 'message', conversationId });
    });
    socket.on('new-notification', () => {
      void this.#pullThen({ type: 'notification' });
    });
    socket.on('user-online', (payload: { userId?: unknown }) => {
      if (typeof payload?.userId === 'string') this.#deps.emit({ type: 'presence', userId: payload.userId, online: true });
    });
    socket.on('user-offline', (payload: { userId?: unknown }) => {
      if (typeof payload?.userId === 'string') this.#deps.emit({ type: 'presence', userId: payload.userId, online: false });
    });
  }

  #dropAndRetry(socket: SocketLike, generation: number): void {
    this.#socket = null;
    socket.disconnect();
    this.#scheduleRetry(generation);
  }

  #scheduleRetry(generation: number): void {
    if (this.#retry !== null) return;
    const delay = Math.min(FIRST_RETRY_MS * 2 ** this.#failures, MAX_RETRY_MS);
    this.#failures += 1;
    this.#retry = this.#deps.setTimer(() => {
      this.#retry = null;
      if (generation === this.#generation && this.#deps.shouldRun()) void this.#connect(generation);
    }, delay);
  }

  /** One pull at a time; events during a pull get one more pull after it. */
  async #pullThen(event: RealtimeEvent): Promise<void> {
    await this.#pull();
    this.#deps.emit(event);
  }

  #pull(): Promise<void> {
    if (this.#pulling) {
      this.#pullAgain = true;
      return this.#pulling;
    }
    this.#pulling = (async () => {
      do {
        this.#pullAgain = false;
        try {
          await this.#deps.pullNow();
        } catch {
          // A failed pull still tells the renderer; it reloads what it has.
        }
      } while (this.#pullAgain);
    })().finally(() => {
      this.#pulling = null;
    });
    return this.#pulling;
  }
}
