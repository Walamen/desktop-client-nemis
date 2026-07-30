import { api } from '../api';

/** Offline sync — shared by every portal's StatusBar and sync-conflicts screen. */
export const syncBridge = {
  runSync: () => api().sync.run(),
  getSyncStatus: () => api().sync.getStatus(),
  listSyncConflicts: () => api().sync.listConflicts(),
  resolveSyncConflict: (conflictId: string, resolution: 'keep_local' | 'accept_remote') =>
    api().sync.resolveConflict({ conflictId, resolution }),
};
