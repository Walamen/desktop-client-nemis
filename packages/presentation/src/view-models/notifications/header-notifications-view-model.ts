import type { IdentityApplicationService } from '@nemis-desktop/application';
import type { HeaderNotification } from '@nemis-desktop/types';
import { createStore } from 'zustand/vanilla';

export interface HeaderNotificationsState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly unread: number;
  readonly recent: readonly HeaderNotification[];
}

export interface HeaderNotificationsViewModelDeps {
  readonly identity: IdentityApplicationService;
}

/** Header bell: unread count + the most recent notifications. A reload keeps
 * the current data on screen; a failure keeps the last data and flags error. */
export class HeaderNotificationsViewModel {
  readonly store = createStore<HeaderNotificationsState>(() => ({
    status: 'idle',
    unread: 0,
    recent: [],
  }));

  #latestRequest = 0;

  constructor(private readonly deps: HeaderNotificationsViewModelDeps) {}

  /** Back to idle with no data (a different user signed in) and drop any
   * in-flight load so it cannot repopulate the previous user's summary. */
  reset(): void {
    this.#latestRequest++;
    this.store.setState({ status: 'idle', unread: 0, recent: [] });
  }

  async load(): Promise<void> {
    const requestId = ++this.#latestRequest;
    if (this.store.getState().status === 'idle') this.store.setState({ status: 'loading' });
    try {
      const res = await this.deps.identity.getHeaderNotifications();
      if (requestId !== this.#latestRequest) return; // a newer load superseded this one
      const data = res.data;
      if (!data) {
        console.error('Header notifications failed to load', res.warnings ?? 'no data returned');
        this.store.setState({ status: 'error' });
        return;
      }
      this.store.setState({ status: 'ready', unread: data.unread, recent: data.recent });
    } catch (error) {
      if (requestId !== this.#latestRequest) return;
      console.error('Header notifications failed to load', error);
      this.store.setState({ status: 'error' });
    }
  }
}
