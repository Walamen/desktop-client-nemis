import { IpcChannels } from '@nemis-desktop/types';
import {
  assertListPendingRecordsArgs,
  assertNoArgs,
  assertResolveSyncConflictArgs,
} from '@app/security/validateIpc';
import type { DesktopSyncWorker } from '@app/sync/DesktopSyncWorker';
import type { IpcHandle } from '@app/ipc/registrar';

export function registerSyncHandlers(handle: IpcHandle, worker: DesktopSyncWorker): void {
  handle(IpcChannels.SYNC_RUN, assertNoArgs, async () => {
    // A person pressing "Sync now" expects everything to be attempted, so
    // backed-off rows go now instead of waiting out their timers.
    worker.releaseBackoff({ manual: true });
    await worker.syncActive();
    return worker.getStatus();
  });
  handle(IpcChannels.SYNC_GET_STATUS, assertNoArgs, () => worker.getStatus());
  handle(IpcChannels.SYNC_LIST_CONFLICTS, assertNoArgs, () => worker.listConflicts());
  handle(IpcChannels.SYNC_RESOLVE_CONFLICT, assertResolveSyncConflictArgs, (request) =>
    worker.resolveConflict(request),
  );
  handle(IpcChannels.SYNC_LIST_PENDING, assertNoArgs, () => worker.listPending());
  handle(IpcChannels.SYNC_LIST_PENDING_RECORDS, assertListPendingRecordsArgs, (request) =>
    worker.listPendingRecords(request),
  );
}
