import { randomUUID } from 'node:crypto';
import type {
  DesktopSyncOperation,
  DesktopSyncStatus,
  ResolveSyncConflictRequest,
  SyncConflictResult,
} from '@nemis-desktop/types';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { BackendProvisioningGateway } from '@app/provisioning/BackendProvisioningGateway';
import type { ActiveWorkspace, WorkspaceManager } from '@app/workspace/WorkspaceManager';
import { ProvisioningImporter } from '@app/provisioning/ProvisioningImporter';
import { AssignmentSyncService } from './AssignmentSyncService';
import { logger } from '@app/services/logger';

const BACKOFF_SCHEDULE_MS = [30_000, 60_000, 300_000, 900_000] as const; // 30s, 1m, 5m, 15m
const DEAD_LETTER_THRESHOLD = 5;
/**
 * BackendProvisioningGateway throws exactly this message for network-level
 * failures (timeout/DNS/refused), as distinct from a server-side rejection,
 * which throws a status-bearing message. A failure to reach the server says
 * nothing about the item, so it must not consume the item's retry budget.
 * Compared by message rather than by importing the gateway, which this worker
 * intentionally depends on by type only.
 */
const UNREACHABLE_SERVER_MESSAGE = 'The NEMIS server could not be reached.';

/** Minimal seam so DesktopSyncWorker doesn't depend on the concrete NetworkMonitor class. */
export interface ConnectivitySource {
  isOnline(): boolean;
}

export class DesktopSyncWorker {
  #running = false;
  #lastPullAt = 0;

  private readonly assignmentSync: AssignmentSyncService;

  constructor(
    private readonly workspaces: WorkspaceManager,
    private readonly gateway: BackendProvisioningGateway,
    private readonly connectivity: ConnectivitySource,
  ) {
    this.assignmentSync = new AssignmentSyncService(gateway);
  }

  async syncActive(): Promise<void> {
    if (this.#running) return;
    // Offline: claiming a batch here would only fail the push and burn every
    // claimed item's retry budget against a network that is known to be down.
    if (!this.connectivity.isOnline()) return;
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
    // Crash recovery has to run here rather than once at boot: at boot no
    // workspace is unlocked yet (activation happens later over IPC), so the
    // recovery would silently no-op and a stranded row would block its own
    // item forever AND every future delta pull (the pull gate below counts
    // in_flight as still-pending) AND every subsequent ProvisioningImporter
    // run. Here a workspace is guaranteed active, and this covers startup,
    // login, the interval, reconnect, and manual sync at once. Safe because
    // the #running guard above means no in-process cycle is holding in_flight
    // rows at this point, and requestSingleInstanceLock rules out a second
    // process.
    this.recoverStaleInFlight();
    // Own dedicated push path, deliberately outside the generic sync_queue
    // claim/backoff/dead-letter machinery below — see AssignmentSyncService's
    // doc comment. A failure here must never abort the generic cycle.
    try {
      await this.assignmentSync.pushPending(workspace.database.connection);
    } catch (error) {
      logger.error('AssignmentSyncService.pushPending failed', error);
    }
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
          for (const result of pushed.results) {
            if (result.entityType !== 'guardians' || !result.redirectedTo) continue;
            this.#canonicalizeGuardian(workspace.database.connection, result.entityId, result.redirectedTo);
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
        const meta = workspace.database.connection.prepare(
          `SELECT lastDeltaAt, lastFullResyncAt FROM sync_metadata WHERE id='singleton'`,
        ).get() as { lastDeltaAt: string | null; lastFullResyncAt: string | null };
        const fullResyncDue =
          !meta.lastFullResyncAt || Date.now() - Date.parse(meta.lastFullResyncAt) >= 24 * 60 * 60_000;
        const since = fullResyncDue ? undefined : (meta.lastDeltaAt ?? undefined);
        const snapshot = await this.gateway.downloadSnapshot(completion.serverDeviceId, since);
        if (this.workspaces.active.identity !== workspace.identity) return;
        new ProvisioningImporter(workspace.database).import(snapshot, {
          userId: workspace.user.id,
          role: workspace.user.role,
          scopeType: workspace.user.scope.type,
          scopeId: workspace.user.scope.scopeId,
          institutionId: workspace.user.institutionId,
          serverDeviceId: completion.serverDeviceId,
        }, { preserveConflicts: true, merge: !fullResyncDue });
        this.#lastPullAt = Date.now();
        // lastDeltaAt is the cutoff the next pull's `since` is measured against,
        // so it must be the server's own generatedAt (already validated as a
        // non-empty string by the gateway). The local clock would skip whatever
        // the server wrote during the download/import window, and skew makes it
        // worse. lastFullResyncAt only answers "when did THIS device last do a
        // full resync", so it stays on the local clock.
        const pulledAt = new Date().toISOString();
        workspace.database.connection.prepare(`
          UPDATE sync_metadata SET lastDeltaAt=?${fullResyncDue ? ',lastFullResyncAt=?' : ''} WHERE id='singleton'
        `).run(...(fullResyncDue ? [snapshot.generatedAt, pulledAt] : [snapshot.generatedAt]));
      }
    } catch (error) {
      try {
        if (this.workspaces.active.identity !== workspace.identity) return;
      } catch {
        return;
      }
      const now = new Date().toISOString();
      if (claimed.length > 0) {
        // The push may well have succeeded — marking every claimed item
        // 'completed' — before a later step in the same cycle (the pull) threw.
        // Only items still in_flight actually failed; rescheduling or
        // dead-lettering the rest would resurrect changes the server already
        // applied.
        const stillInFlight = new Set(
          (
            workspace.database.connection.prepare(
              `SELECT id FROM sync_queue WHERE status='in_flight' AND id IN (${claimed.map(() => '?').join(',')})`,
            ).all(...claimed.map((item) => item.id)) as Array<{ id: string }>
          ).map((row) => row.id),
        );
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;
        for (const item of claimed) {
          if (!stillInFlight.has(item.id)) continue; // already completed successfully earlier in this cycle
          if (message === UNREACHABLE_SERVER_MESSAGE) {
            // Unreachable server: return the item to the queue unpenalised so
            // the next cycle (or a reconnect) can claim it immediately.
            workspace.database.connection.prepare(
              `UPDATE sync_queue SET status='pending',nextAttemptAt=NULL,updatedAt=? WHERE id=?`,
            ).run(now, item.id);
            continue;
          }
          const nextRetryCount = item.retryCount + 1;
          if (nextRetryCount >= DEAD_LETTER_THRESHOLD) {
            // SyncQueueService.fail() wraps markFailed()+recordError() in its
            // own transaction, which would leave a crash window between that
            // commit and the deadLetter UPDATE below if run separately. Its
            // work is synchronous (fail() is only async for the Promise
            // contract), so call the repository directly here — same reason
            // recordError is called directly in the branch below — and fold
            // the deadLetter marker into the same IMMEDIATE transaction so
            // the whole dead-letter transition is atomic. Nested
            // executeTransaction calls inside markFailed()/recordError()
            // compose as SAVEPOINTs under this outer transaction.
            workspace.database.transactions.runImmediate(() => {
              workspace.data.repositories.syncQueue.markFailed(item.id);
              workspace.data.repositories.syncQueue.recordError({
                operationId: item.id,
                message,
                stack: stack ?? null,
                retryCount: nextRetryCount,
              });
              workspace.database.connection.prepare(`
                UPDATE sync_queue SET deadLetter=1,updatedAt=? WHERE id=?
              `).run(now, item.id);
            });
          } else {
            const delayMs = BACKOFF_SCHEDULE_MS[nextRetryCount - 1] ?? BACKOFF_SCHEDULE_MS.at(-1)!;
            await workspace.data.services.syncQueue.scheduleRetry(
              item.id,
              new Date(Date.now() + delayMs).toISOString(),
            );
            // recordError lives on the repository, not the SyncQueueService
            // facade (only fail() wraps it there), so call it directly.
            workspace.data.repositories.syncQueue.recordError({
              operationId: item.id,
              message,
              stack: stack ?? null,
              retryCount: nextRetryCount,
            });
          }
        }
      }
      workspace.database.connection.prepare(`
        UPDATE sync_metadata SET syncStatus='failed',updatedAt=? WHERE id='singleton'
      `).run(now);
      throw error;
    } finally {
      this.#running = false;
    }
  }

  /** Crash/shutdown-race recovery: items stuck in_flight from a prior process can never be re-claimed otherwise. */
  recoverStaleInFlight(): void {
    const workspace = this.#activeWorkspaceOrNull();
    if (!workspace) return;
    workspace.database.connection.prepare(
      `UPDATE sync_queue SET status='pending',updatedAt=? WHERE status='in_flight'`,
    ).run(new Date().toISOString());
  }

  /** Clears backoff so a reconnect-triggered sync can claim everything pending immediately. */
  releaseBackoff(): void {
    const workspace = this.#activeWorkspaceOrNull();
    if (!workspace) return;
    workspace.database.connection.prepare(
      `UPDATE sync_queue SET nextAttemptAt=NULL WHERE status='pending' AND nextAttemptAt IS NOT NULL`,
    ).run();
  }

  /**
   * Lifecycle hooks (reconnect, boot) can fire before any workspace is
   * unlocked, and WorkspaceManager throws in that state. Both callers are
   * fire-and-forget — NetworkMonitor invokes its onOnline callback from an
   * un-awaited probe — so "no workspace" has to mean "nothing to do" rather
   * than an unhandled throw. syncActive() guards the same way.
   */
  #activeWorkspaceOrNull(): ActiveWorkspace | null {
    try {
      return this.workspaces.active;
    } catch {
      return null;
    }
  }

  /**
   * A guardian create the server redirected to an existing account's
   * canonical row (see DesktopSyncApplier.guardian() in the Nemis repo) —
   * rewrite this device's local copy to match. Without this, the next
   * snapshot pull would leave the local row diverging from Postgres, and
   * any not-yet-pushed link operation still referencing the old id would
   * fail server-side once it's finally sent.
   */
  #canonicalizeGuardian(connection: SqliteDatabase, oldId: string, newId: string): void {
    if (oldId === newId) return;
    // PRAGMA defer_foreign_keys = ON postpones FK enforcement to COMMIT (rather
    // than waiving it). This is necessary because deleting oldId guardian would
    // immediately violate the FK from rows still referencing it; we need to
    // defer that check until all updates complete. However, the UPDATE OR IGNORE
    // cascade can still skip rows if (studentId, newId) already exists, leaving
    // orphaned references to oldId; the DELETE below cleans those up.
    connection.prepare(`PRAGMA defer_foreign_keys = ON`).run();
    // Try to rename the guardian ID in case the canonical doesn't exist yet.
    // If it does exist (UNIQUE key violation), skip this update; we'll delete the
    // old row later. Using OR IGNORE allows both cases to proceed smoothly.
    connection.prepare(`UPDATE OR IGNORE guardians SET id = ? WHERE id = ?`).run(newId, oldId);
    connection
      .prepare(`UPDATE OR IGNORE student_guardians SET guardianId = ? WHERE guardianId = ?`)
      .run(newId, oldId);
    // Remove any student_guardians rows that still reference oldId (either
    // because they conflicted with an existing (studentId, newId) unique key or
    // because the canonical guardian already existed and the rename above was
    // skipped). These are duplicates or orphaned — the student is already linked
    // to the canonical guardian via the row that exists.
    connection.prepare(`DELETE FROM student_guardians WHERE guardianId = ?`).run(oldId);
    // Finally, delete the old guardian row if it still exists (in case the
    // rename failed because the canonical ID already existed).
    connection.prepare(`DELETE FROM guardians WHERE id = ?`).run(oldId);
    connection
      .prepare(
        `UPDATE sync_queue
            SET payload = json_set(payload, '$.record.guardianId', ?)
          WHERE entityType = 'student_guardians'
            AND status IN ('pending','in_flight')
            AND json_extract(payload, '$.record.guardianId') = ?`,
      )
      .run(newId, oldId);
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
      isOnline: this.connectivity.isOnline(),
    };
  }

  listConflicts(): SyncConflictResult[] {
    const db = this.workspaces.active.database.connection;
    const conflictRows = db.prepare(`
      SELECT id,operationId,entityType,entityId,operationType,localPayload,remotePayload,
             reason,status,createdAt,resolvedAt
      FROM sync_conflicts WHERE status='unresolved' ORDER BY createdAt,id
    `).all() as Array<Omit<SyncConflictResult, 'localPayload' | 'remotePayload' | 'source'> & {
      localPayload: string | null;
      remotePayload: string | null;
    }>;
    const deadLetterRows = db.prepare(`
      SELECT q.id,q.entityType,q.entityId,q.operationType,q.payload,q.createdAt,
             (SELECT message FROM sync_errors WHERE operationId = q.id ORDER BY createdAt DESC, id DESC LIMIT 1) AS lastError,
             q.retryCount
      FROM sync_queue q WHERE q.status='failed' AND q.deadLetter=1 ORDER BY q.createdAt,q.id
    `).all() as Array<{
      id: string;
      entityType: string;
      entityId: string;
      operationType: string;
      payload: string | null;
      createdAt: string;
      lastError: string | null;
      retryCount: number;
    }>;
    return [
      ...conflictRows.map((row) => ({
        ...row,
        localPayload: row.localPayload ? JSON.parse(row.localPayload) : null,
        remotePayload: row.remotePayload ? JSON.parse(row.remotePayload) : null,
        source: 'conflict' as const,
      })),
      ...deadLetterRows.map((row) => ({
        id: row.id,
        operationId: row.id,
        entityType: row.entityType,
        entityId: row.entityId,
        operationType: row.operationType as SyncConflictResult['operationType'],
        localPayload: row.payload ? JSON.parse(row.payload) : null,
        remotePayload: null,
        reason: `Sync failed after ${row.retryCount} attempts: ${row.lastError ?? 'unknown error'}`,
        status: 'unresolved' as const,
        source: 'dead_letter' as const,
        createdAt: row.createdAt,
        resolvedAt: null,
      })),
    ];
  }

  resolveConflict(request: ResolveSyncConflictRequest): SyncConflictResult {
    const db = this.workspaces.active.database;
    if (request.resolution === 'retry') {
      return db.transactions.runImmediate(() => {
        const row = db.connection.prepare(`
          SELECT id,entityType,entityId,operationType,payload,createdAt
          FROM sync_queue WHERE id=? AND status='failed' AND deadLetter=1
        `).get(request.conflictId) as
          | { id: string; entityType: string; entityId: string; operationType: string; payload: string | null; createdAt: string }
          | undefined;
        if (!row) throw new Error('The dead-lettered sync item was not found or was already retried.');
        const resolvedAt = new Date().toISOString();
        db.connection.prepare(`
          UPDATE sync_queue SET status='pending',retryCount=0,nextAttemptAt=NULL,deadLetter=0,updatedAt=?
          WHERE id=?
        `).run(resolvedAt, row.id);
        return {
          id: row.id,
          operationId: row.id,
          entityType: row.entityType,
          entityId: row.entityId,
          operationType: row.operationType as SyncConflictResult['operationType'],
          localPayload: row.payload ? JSON.parse(row.payload) : null,
          remotePayload: null,
          reason: 'Retried by user.',
          status: 'retried' as const,
          source: 'dead_letter' as const,
          createdAt: row.createdAt,
          resolvedAt,
        };
      });
    }
    // Narrowed to a plain const so the exclusion of 'retry' (checked above)
    // survives capture by the closure below — TS re-widens `request.resolution`
    // itself inside nested function bodies.
    const resolution: 'keep_local' | 'accept_remote' = request.resolution;
    return db.transactions.runImmediate(() => {
      const row = db.connection.prepare(`
        SELECT id,operationId,entityType,entityId,operationType,localPayload,remotePayload,
               reason,status,createdAt,resolvedAt
        FROM sync_conflicts WHERE id=? AND status='unresolved'
      `).get(request.conflictId) as RawConflict | undefined;
      if (!row) throw new Error('The synchronization conflict was not found or is already resolved.');
      const resolvedAt = new Date().toISOString();
      if (resolution === 'keep_local') {
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
      `).run(resolution, resolvedAt, row.id);
      return { ...toConflict({ ...row, status: resolution, resolvedAt }), source: 'conflict' as const };
    });
  }
}

type RawConflict = Omit<SyncConflictResult, 'localPayload' | 'remotePayload' | 'source'> & {
  localPayload: string | null;
  remotePayload: string | null;
};

function toConflict(row: RawConflict): Omit<SyncConflictResult, 'source'> {
  return {
    ...row,
    localPayload: row.localPayload ? JSON.parse(row.localPayload) : null,
    remotePayload: row.remotePayload ? JSON.parse(row.remotePayload) : null,
  };
}
