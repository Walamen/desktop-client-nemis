import { randomUUID } from 'node:crypto';
import type {
  DesktopSyncOperation,
  DesktopSyncStatus,
  ResolveSyncConflictRequest,
  SyncConflictResult,
} from '@nemis-desktop/types';
import type { BackendProvisioningGateway } from '@app/provisioning/BackendProvisioningGateway';
import type { WorkspaceManager } from '@app/workspace/WorkspaceManager';
import { ProvisioningImporter } from '@app/provisioning/ProvisioningImporter';

export class DesktopSyncWorker {
  #running = false;
  #lastPullAt = 0;

  constructor(
    private readonly workspaces: WorkspaceManager,
    private readonly gateway: BackendProvisioningGateway,
  ) {}

  async syncActive(): Promise<void> {
    if (this.#running) return;
    let workspace;
    try {
      workspace = this.workspaces.active;
    } catch {
      return;
    }
    const completion = workspace.database.connection.prepare(
      `SELECT serverDeviceId FROM provisioning_metadata
       WHERE id='singleton' AND status='complete'`,
    ).get() as { serverDeviceId: string | null } | undefined;
    if (!completion?.serverDeviceId) return;

    this.#running = true;
    const claimed = await workspace.data.services.syncQueue.claim(50);
    const pullDue = Date.now() - this.#lastPullAt >= 5 * 60_000;
    if (claimed.length === 0 && !pullDue) {
      this.#running = false;
      return;
    }
    try {
      if (claimed.length > 0) {
        const operations: DesktopSyncOperation[] = claimed.map((item) => ({
          operationId: item.id,
          entityType: item.entityType,
          entityId: item.entityId,
          operationType: item.operationType,
          payload: item.payload,
        }));
        const pushed = await this.gateway.pushChanges(completion.serverDeviceId, operations);
        if (
          pushed.results.length !== claimed.length ||
          new Set(pushed.results.map((result) => result.operationId)).size !== claimed.length
        ) {
          throw new Error('The server returned an incomplete sync acknowledgement.');
        }
        if (this.workspaces.active.identity !== workspace.identity) return;
        const byId = new Map(claimed.map((item) => [item.id, item]));
        workspace.database.transactions.runImmediate(() => {
          for (const result of pushed.results) {
            if (result.status !== 'conflict') continue;
            const local = byId.get(result.operationId)?.payload;
            workspace.database.connection.prepare(`
            INSERT INTO sync_conflicts
                (id,operationId,entityType,entityId,operationType,localPayload,remotePayload,reason,status,createdAt,resolvedAt)
              VALUES (?,?,?,?,?,?,?,?,'unresolved',?,NULL)
            `).run(
              randomUUID(),
              result.operationId,
              result.entityType,
              result.entityId,
              byId.get(result.operationId)?.operationType ?? 'update',
              local == null ? null : JSON.stringify(local),
              result.remotePayload == null ? null : JSON.stringify(result.remotePayload),
              result.reason ?? 'The server rejected this offline change.',
              pushed.processedAt,
            );
          }
          workspace.database.connection.prepare(`
            UPDATE sync_queue SET status='completed',updatedAt=?
            WHERE id IN (${pushed.results.map(() => '?').join(',')})
          `).run(pushed.processedAt, ...pushed.results.map((result) => result.operationId));
        });
      }

      const stillPending = workspace.database.connection.prepare(
        `SELECT COUNT(*) count FROM sync_queue WHERE status IN ('pending','in_flight')`,
      ).get() as { count: number };
      if (stillPending.count === 0) {
        const snapshot = await this.gateway.downloadSnapshot(completion.serverDeviceId);
        if (this.workspaces.active.identity !== workspace.identity) return;
        new ProvisioningImporter(workspace.database).import(snapshot, {
          userId: workspace.user.id,
          role: workspace.user.role,
          scopeType: workspace.user.scope.type,
          scopeId: workspace.user.scope.scopeId,
          institutionId: workspace.user.institutionId,
          serverDeviceId: completion.serverDeviceId,
        }, { preserveConflicts: true });
        this.#lastPullAt = Date.now();
      }
    } catch (error) {
      try {
        if (this.workspaces.active.identity !== workspace.identity) return;
      } catch {
        return;
      }
      const now = new Date().toISOString();
      if (claimed.length > 0) {
        workspace.database.connection.prepare(`
          UPDATE sync_queue SET status='pending',updatedAt=?
          WHERE status='in_flight' AND id IN (${claimed.map(() => '?').join(',')})
        `).run(now, ...claimed.map((item) => item.id));
      }
      workspace.database.connection.prepare(`
        UPDATE sync_metadata SET syncStatus='failed',updatedAt=? WHERE id='singleton'
      `).run(now);
      throw error;
    } finally {
      this.#running = false;
    }
  }

  getStatus(): DesktopSyncStatus {
    const db = this.workspaces.active.database.connection;
    const count = (status: string) => (db.prepare(
      `SELECT COUNT(*) count FROM sync_queue WHERE status=?`,
    ).get(status) as { count: number }).count;
    const metadata = db.prepare(
      `SELECT lastSyncAt,syncStatus FROM sync_metadata WHERE id='singleton'`,
    ).get() as { lastSyncAt: string | null; syncStatus: DesktopSyncStatus['status'] };
    const conflicts = (db.prepare(
      `SELECT COUNT(*) count FROM sync_conflicts WHERE status='unresolved'`,
    ).get() as { count: number }).count;
    return {
      pending: count('pending'),
      inFlight: count('in_flight'),
      conflicts,
      lastSyncAt: metadata.lastSyncAt,
      status: this.#running ? 'syncing' : metadata.syncStatus,
    };
  }

  listConflicts(): SyncConflictResult[] {
    const rows = this.workspaces.active.database.connection.prepare(`
      SELECT id,operationId,entityType,entityId,operationType,localPayload,remotePayload,
             reason,status,createdAt,resolvedAt
      FROM sync_conflicts WHERE status='unresolved' ORDER BY createdAt,id
    `).all() as Array<Omit<SyncConflictResult, 'localPayload' | 'remotePayload'> & {
      localPayload: string | null;
      remotePayload: string | null;
    }>;
    return rows.map((row) => ({
      ...row,
      localPayload: row.localPayload ? JSON.parse(row.localPayload) : null,
      remotePayload: row.remotePayload ? JSON.parse(row.remotePayload) : null,
    }));
  }

  resolveConflict(request: ResolveSyncConflictRequest): SyncConflictResult {
    const db = this.workspaces.active.database;
    return db.transactions.runImmediate(() => {
      const row = db.connection.prepare(`
        SELECT id,operationId,entityType,entityId,operationType,localPayload,remotePayload,
               reason,status,createdAt,resolvedAt
        FROM sync_conflicts WHERE id=? AND status='unresolved'
      `).get(request.conflictId) as RawConflict | undefined;
      if (!row) throw new Error('The synchronization conflict was not found or is already resolved.');
      const resolvedAt = new Date().toISOString();
      if (request.resolution === 'keep_local') {
        db.connection.prepare(`
          INSERT INTO sync_queue
            (id,entityType,entityId,operationType,payload,retryCount,status,createdAt,updatedAt)
          VALUES (?,?,?,?,?,0,'pending',?,?)
        `).run(
          randomUUID(),
          row.entityType,
          row.entityId,
          row.operationType,
          row.localPayload,
          resolvedAt,
          resolvedAt,
        );
      }
      db.connection.prepare(`
        UPDATE sync_conflicts SET status=?,resolvedAt=? WHERE id=?
      `).run(request.resolution, resolvedAt, row.id);
      return toConflict({ ...row, status: request.resolution, resolvedAt });
    });
  }
}

type RawConflict = Omit<SyncConflictResult, 'localPayload' | 'remotePayload'> & {
  localPayload: string | null;
  remotePayload: string | null;
};

function toConflict(row: RawConflict): SyncConflictResult {
  return {
    ...row,
    localPayload: row.localPayload ? JSON.parse(row.localPayload) : null,
    remotePayload: row.remotePayload ? JSON.parse(row.remotePayload) : null,
  };
}
