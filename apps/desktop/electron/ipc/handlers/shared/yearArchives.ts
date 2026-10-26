import { IpcChannels } from '@nemis-desktop/types';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertNoArgs } from '@app/security/validateIpc';
import type { WorkspaceManager } from '@app/workspace/WorkspaceManager';
import { SqliteYearArchiveReadModel } from '@app/data/repositories/sqlite/business/SqliteYearArchiveReadModel';

/** Year closures for district (DEO) and county officers (see
 * authorizeChannel.ts). Reads the active workspace's own database, which
 * holds only the schools that account is authorized for. */
export function registerYearArchiveHandlers(handle: IpcHandle, workspaces: WorkspaceManager): void {
  handle(IpcChannels.YEAR_ARCHIVES_LIST, assertNoArgs, () =>
    new SqliteYearArchiveReadModel({ connection: workspaces.active.database.connection }).list(),
  );
}
