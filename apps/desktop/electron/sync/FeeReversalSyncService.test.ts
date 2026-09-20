import Database from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { migrations } from '@app/database/migrations/registry';
import { FeeReversalSyncService } from './FeeReversalSyncService';

function db(): SqliteDatabase {
  const connection = new Database(':memory:');
  // fee_payment_reversals.paymentId references fee_payments, which these
  // tests never seed — same approach as the Task 1 migration test
  // (023-create-fee-payment-reversals.test.ts).
  connection.pragma('foreign_keys = OFF');
  for (const migration of migrations) migration.up(connection);
  return connection;
}

function seedReversal(connection: SqliteDatabase, paymentId = 'pay-1') {
  const now = new Date().toISOString();
  connection
    .prepare(
      `INSERT INTO fee_payment_reversals
         (id,paymentId,institutionId,reason,notes,reversedBy,reversedAt,createdAt,updatedAt,syncedAt)
       VALUES (?,?,?,?,?,?,?,?,?,NULL)`,
    )
    .run(`rev-${paymentId}`, paymentId, 'school-1', 'wrong amount', null, 'admin-1', now, now, now);
}

function queuePaymentCreate(connection: SqliteDatabase, paymentId: string, status: string) {
  const now = new Date().toISOString();
  connection
    .prepare(
      `INSERT INTO sync_queue
         (id,entityType,entityId,operationType,payload,retryCount,status,createdAt,updatedAt)
       VALUES (?,?,?,'create','{}',0,?,?,?)`,
    )
    .run(`q-${paymentId}`, 'fee_payments', paymentId, status, now, now);
}

function syncedAt(connection: SqliteDatabase, paymentId = 'pay-1') {
  return (
    connection
      .prepare(`SELECT syncedAt FROM fee_payment_reversals WHERE paymentId=?`)
      .get(paymentId) as { syncedAt: string | null }
  ).syncedAt;
}

describe('FeeReversalSyncService', () => {
  let connection: SqliteDatabase;
  beforeEach(() => {
    connection = db();
  });

  it('pushes a pending reversal and marks it synced', async () => {
    seedReversal(connection);
    const reverseFeePayment = vi.fn().mockResolvedValue(undefined);
    await new FeeReversalSyncService({ reverseFeePayment }).pushPending(connection);
    expect(reverseFeePayment).toHaveBeenCalledWith('pay-1', { reason: 'wrong amount', notes: undefined });
    expect(syncedAt(connection)).not.toBeNull();
  });

  it('waits while the payment\'s own create is still queued', async () => {
    seedReversal(connection);
    queuePaymentCreate(connection, 'pay-1', 'pending');
    const reverseFeePayment = vi.fn().mockResolvedValue(undefined);
    await new FeeReversalSyncService({ reverseFeePayment }).pushPending(connection);
    expect(reverseFeePayment).not.toHaveBeenCalled();
    expect(syncedAt(connection)).toBeNull();
  });

  it('pushes once that create has completed', async () => {
    seedReversal(connection);
    queuePaymentCreate(connection, 'pay-1', 'completed');
    const reverseFeePayment = vi.fn().mockResolvedValue(undefined);
    await new FeeReversalSyncService({ reverseFeePayment }).pushPending(connection);
    expect(reverseFeePayment).toHaveBeenCalledTimes(1);
    expect(syncedAt(connection)).not.toBeNull();
  });

  it('treats an already-reversed conflict as converged', async () => {
    seedReversal(connection);
    const reverseFeePayment = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('Payment has already been reversed'), { status: 409 }));
    await new FeeReversalSyncService({ reverseFeePayment }).pushPending(connection);
    expect(syncedAt(connection)).not.toBeNull();
  });

  it('records a conflict and stops retrying when the payment is unknown to the server', async () => {
    seedReversal(connection);
    const reverseFeePayment = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('Payment not found'), { status: 404 }));
    await new FeeReversalSyncService({ reverseFeePayment }).pushPending(connection);
    expect(syncedAt(connection)).not.toBeNull();
    const conflicts = connection
      .prepare(`SELECT entityType,entityId,status FROM sync_conflicts`)
      .all() as { entityType: string; entityId: string; status: string }[];
    expect(conflicts).toEqual([
      { entityType: 'fee_payment_reversals', entityId: 'pay-1', status: 'unresolved' },
    ]);
  });

  it('leaves the row dirty on a network error', async () => {
    seedReversal(connection);
    const reverseFeePayment = vi.fn().mockRejectedValue(new Error('offline'));
    await new FeeReversalSyncService({ reverseFeePayment }).pushPending(connection);
    expect(syncedAt(connection)).toBeNull();
  });

  it('does not let one failure stop the next reversal', async () => {
    seedReversal(connection, 'pay-1');
    seedReversal(connection, 'pay-2');
    const reverseFeePayment = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);
    await new FeeReversalSyncService({ reverseFeePayment }).pushPending(connection);
    expect(reverseFeePayment).toHaveBeenCalledTimes(2);
  });
});
