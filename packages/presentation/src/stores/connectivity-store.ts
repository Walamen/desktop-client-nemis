import { createStore } from 'zustand/vanilla';
import type { SyncStatus } from '../presenters/status-presentation';
import type { NotificationStore } from './notification-store';

export interface ConnectivityState {
  readonly isOnline: boolean;
  readonly syncStatus: SyncStatus;
  readonly lastSyncAt: string | null;
}

/** Written by future sync/IPC phases; read by every screen via selectors.
 * State-only today — no actual networking or sync in the presentation layer. */
export class ConnectivityStore {
  readonly store = createStore<ConnectivityState>(() => ({
    isOnline: true,
    syncStatus: 'idle',
    lastSyncAt: null,
  }));

  constructor(private readonly notifications?: NotificationStore) {}

  setOnline(isOnline: boolean): void {
    const was = this.store.getState().isOnline;
    if (was === isOnline) return;
    this.store.setState({ isOnline });
    if (!isOnline) {
      this.notifications?.warning(
        'You are offline. Your work is saved locally and will sync when the connection returns.',
      );
    } else {
      this.notifications?.info('Back online.');
    }
  }

  setSyncStatus(syncStatus: SyncStatus): void {
    this.store.setState({ syncStatus });
  }

  markSyncCompleted(atIso: string): void {
    this.store.setState({ syncStatus: 'idle', lastSyncAt: atIso });
  }
}
