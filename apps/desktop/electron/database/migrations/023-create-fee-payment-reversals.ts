import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/** Local record of an offline fee-payment reversal.
 *
 * Deliberately NOT in MUTABLE_TABLES and deliberately without outbox
 * triggers. The server's sync applier rejects every non-create operation on
 * fee_payments ("Payments are append-only; use the audited reversal
 * workflow"), so a generic-outbox push of a reversal could never be applied.
 * Reversals push through their own REST path instead — see
 * BackendProvisioningGateway.reverseFeePayment and FeeReversalSyncService,
 * the same arrangement migration 019/020 established for assignments.
 *
 *   syncedAt — NULL until the reversal has been accepted by the backend.
 *              This is the dirty flag FeeReversalSyncService selects on.
 *
 * The UNIQUE index on paymentId mirrors the server's 409 ("Payment has
 * already been reversed") locally, so the UI can refuse a double reversal
 * without a round trip. */
export const createFeePaymentReversals: Migration = {
  version: 23,
  name: 'create-fee-payment-reversals',
  up(db: SqliteDatabase): void {
    db.exec(`
      CREATE TABLE fee_payment_reversals (
        id            TEXT PRIMARY KEY,
        paymentId     TEXT NOT NULL REFERENCES fee_payments (id),
        institutionId TEXT NOT NULL,
        reason        TEXT NOT NULL,
        notes         TEXT,
        reversedBy    TEXT NOT NULL,
        reversedAt    TEXT NOT NULL,
        createdAt     TEXT NOT NULL,
        updatedAt     TEXT NOT NULL,
        syncedAt      TEXT
      );
      CREATE UNIQUE INDEX idx_fee_payment_reversals_payment
        ON fee_payment_reversals (paymentId);
      CREATE INDEX idx_fee_payment_reversals_pending
        ON fee_payment_reversals (syncedAt);
    `);
  },
};
