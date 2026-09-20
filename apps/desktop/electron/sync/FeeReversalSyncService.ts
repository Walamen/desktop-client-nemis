import { randomUUID } from 'node:crypto';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { BackendProvisioningGateway } from '@app/provisioning/BackendProvisioningGateway';
import { logger } from '@app/services/logger';

interface ReversalRow {
  id: string;
  paymentId: string;
  reason: string;
  notes: string | null;
}

/** Pushes locally-recorded payment reversals to the backend's audited
 * reversal endpoint, deliberately outside the generic sync_queue: that
 * queue's server-side applier rejects every non-create operation on
 * fee_payments, so a reversal can only travel through this REST path. Same
 * arrangement as AssignmentSyncService — no backoff schedule and no
 * dead-lettering; a row that fails simply stays dirty for the next cycle. */
export class FeeReversalSyncService {
  constructor(
    private readonly gateway: Pick<BackendProvisioningGateway, 'reverseFeePayment'>,
  ) {}

  async pushPending(db: SqliteDatabase): Promise<void> {
    const rows = db
      .prepare(
        `SELECT id, paymentId, reason, notes FROM fee_payment_reversals WHERE syncedAt IS NULL`,
      )
      .all() as ReversalRow[];

    for (const row of rows) {
      // Ordering gate: the server can only reverse a payment it already has.
      // Anything other than 'completed' means this payment's create is still
      // in flight, still queued, or has failed and may yet retry — in every
      // one of those cases the reversal must wait rather than race ahead.
      const pendingCreate = db
        .prepare(
          `SELECT 1 FROM sync_queue
           WHERE entityType='fee_payments' AND entityId=? AND status<>'completed' LIMIT 1`,
        )
        .get(row.paymentId);
      if (pendingCreate) continue;

      try {
        await this.gateway.reverseFeePayment(row.paymentId, {
          reason: row.reason,
          notes: row.notes ?? undefined,
        });
        this.#markSynced(db, row.id);
      } catch (error) {
        const status = statusOf(error);
        if (status === 409) {
          // The payment was already reversed elsewhere. Both sides agree on
          // the outcome; only the reason differs, and the server's copy wins
          // on the next pull. Nothing left to push.
          logger.info(
            `FeeReversalSyncService: payment ${row.paymentId} was already reversed remotely.`,
          );
          this.#markSynced(db, row.id);
        } else if (status === 404) {
          // The create was rejected outright, so this reversal can never
          // land. Surface it for a human instead of retrying forever.
          this.#recordConflict(db, row, error);
          this.#markSynced(db, row.id);
        } else {
          logger.error(
            `FeeReversalSyncService: failed to push reversal for payment ${row.paymentId}`,
            error,
          );
        }
      }
    }
  }

  #markSynced(db: SqliteDatabase, id: string): void {
    db.prepare(`UPDATE fee_payment_reversals SET syncedAt=? WHERE id=?`).run(
      new Date().toISOString(),
      id,
    );
  }

  #recordConflict(db: SqliteDatabase, row: ReversalRow, error: unknown): void {
    db.prepare(
      `INSERT INTO sync_conflicts
         (id,operationId,entityType,entityId,operationType,localPayload,remotePayload,reason,status,createdAt,resolvedAt)
       VALUES (?,NULL,'fee_payment_reversals',?,'create',?,NULL,?,'unresolved',?,NULL)`,
    ).run(
      randomUUID(),
      row.paymentId,
      JSON.stringify({ reason: row.reason, notes: row.notes }),
      error instanceof Error
        ? error.message
        : 'The server does not have the payment this reversal belongs to.',
      new Date().toISOString(),
    );
  }
}

function statusOf(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: unknown }).status;
    if (typeof status === 'number') return status;
  }
  return undefined;
}
