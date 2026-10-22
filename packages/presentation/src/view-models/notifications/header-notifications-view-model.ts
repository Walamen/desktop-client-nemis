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

  constructor(private readonly deps: HeaderNotificationsViewModelDeps) {}

  async load(): Promise<void> {
    if (this.store.getState().status === 'idle') this.store.setState({ status: 'loading' });
    try {
      const res = await this.deps.identity.getHeaderNotifications();
      const data = res.data;
      if (!data) {
        this.store.setState({ status: 'error' });
        return;
      }
      this.store.setState({ status: 'ready', unread: data.unread, recent: data.recent });
    } catch {
      this.store.setState({ status: 'error' });
    }
  }
}
