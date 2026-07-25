import { IpcChannels } from '@nemis-desktop/types';
import { assertNoArgs, assertResolveSyncConflictArgs } from '@app/security/validateIpc';
import type { DesktopSyncWorker } from '@app/sync/DesktopSyncWorker';
import type { IpcHandle } from '../registrar';

export function registerSyncHandlers(handle: IpcHandle, worker: DesktopSyncWorker): void {
  handle(IpcChannels.SYNC_RUN, assertNoArgs, async () => {
    await worker.syncActive();
    return worker.getStatus();
  });
  handle(IpcChannels.SYNC_GET_STATUS, assertNoArgs, () => worker.getStatus());
  handle(IpcChannels.SYNC_LIST_CONFLICTS, assertNoArgs, () => worker.listConflicts());
  handle(IpcChannels.SYNC_RESOLVE_CONFLICT, assertResolveSyncConflictArgs, (request) =>
    worker.resolveConflict(request),
  );
}
