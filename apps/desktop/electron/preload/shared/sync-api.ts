import { IpcChannels } from '@nemis-desktop/types';
import type { SyncApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const syncApi: SyncApi = {
  run: () => invoke(IpcChannels.SYNC_RUN),
  getStatus: () => invoke(IpcChannels.SYNC_GET_STATUS),
  listConflicts: () => invoke(IpcChannels.SYNC_LIST_CONFLICTS),
  resolveConflict: (request) => invoke(IpcChannels.SYNC_RESOLVE_CONFLICT, request),
};
