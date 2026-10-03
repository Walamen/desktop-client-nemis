import { ForbiddenError } from '@nemis-desktop/shared';
import { DesktopScopeType, SystemRole } from '@nemis-desktop/types';
import type { WorkspaceManager } from '@app/workspace/WorkspaceManager';

/**
 * Whether a student's local create has reached the server (NEMIS ID desktop
 * parity, Stage 6). The student portal login only exists once the server has
 * created the student, so the profile shows the sign-in note only then.
 *
 * Read-only. The outbox triggers write `entityType` as the table name
 * ('students') and start every row `pending`; the worker moves it through
 * `in_flight` to `completed` (or `failed`). Only a create counts: a pending
 * edit does not hide a login that already exists. A pulled student has no
 * queue rows, so it is synced.
 *
 * The worker marks a pushed row `completed` even when the server rejected it
 * as a conflict (e.g. email already registered); that is recorded only in
 * `sync_conflicts`. So an unresolved create conflict also means not synced.
 */
export class StudentSyncStatusService {
  constructor(private readonly workspaces: WorkspaceManager) {}

  isCreateSynced(studentId: string): { synced: boolean } {
    const db = this.context();
    const unsynced = db
      .prepare(
        `SELECT 1 FROM sync_queue
          WHERE entityType = 'students' AND entityId = ?
            AND operationType = 'create' AND status <> 'completed'
          LIMIT 1`,
      )
      .get(studentId);
    if (unsynced !== undefined) return { synced: false };
    const rejected = db
      .prepare(
        `SELECT 1 FROM sync_conflicts
          WHERE entityType = 'students' AND entityId = ?
            AND operationType = 'create' AND status = 'unresolved'
          LIMIT 1`,
      )
      .get(studentId);
    return { synced: rejected === undefined };
  }

  private context() {
    const active = this.workspaces.active;
    if (
      active.user.role !== SystemRole.INSTITUTION_ADMIN ||
      active.user.scope.type !== DesktopScopeType.INSTITUTION
    ) {
      throw new ForbiddenError('Only a school administrator can check student sync status.');
    }
    return active.database.connection;
  }
}
