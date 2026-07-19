import { NotImplementedPresentationError } from '../../errors';
import { presentSyncStatus } from '../../presenters/present-status';
import type { StatusPresentation } from '../../presenters/status-presentation';
import type { ConnectivityStore } from '../../stores/connectivity-store';

/** EXTENSION POINT for the synchronization phase. Sync STATE is live today —
 * this ViewModel reads the shared ConnectivityStore that the future sync
 * worker will write. Only the actions are stubs. */
export class SyncViewModel {
  constructor(private readonly connectivity: ConnectivityStore) {}

  get store() {
    return this.connectivity.store;
  }

  statusPresentation(): StatusPresentation {
    const state = this.connectivity.store.getState();
    return presentSyncStatus(state.syncStatus, state.lastSyncAt);
  }

  startSync(): Promise<void> {
    throw new NotImplementedPresentationError('Manual sync');
  }
}
