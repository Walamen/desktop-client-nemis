import { IpcChannels } from '@nemis-desktop/types';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertNoArgs } from '@app/security/validateIpc';
import type { WorkspaceManager } from '@app/workspace/WorkspaceManager';
import { SqliteAcademicContextReadModel } from '@app/data/repositories/sqlite/business/SqliteAcademicContextReadModel';

/** The Header's active-year label, for school admins and teachers (see
 * authorizeChannel.ts). Reads the active workspace's own database. */
export function registerAcademicContextHandlers(
  handle: IpcHandle,
  workspaces: WorkspaceManager,
  now: () => Date = () => new Date(),
): void {
  handle(IpcChannels.ACADEMIC_CONTEXT_GET, assertNoArgs, () => {
    const connection = workspaces.active.database.connection;
    const meta = connection
      .prepare(`SELECT institutionId FROM provisioning_metadata WHERE id = 'singleton'`)
      .get() as { institutionId: string | null } | undefined;
    const today = now().toISOString().slice(0, 10);
    return new SqliteAcademicContextReadModel({ connection }).get(meta?.institutionId ?? null, today);
  });
}
