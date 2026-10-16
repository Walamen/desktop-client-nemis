import type { PendingGroupSummary } from '@nemis-desktop/types';
import { FEE_REVERSAL_PENDING, feePaymentUnsettled } from '../pendingPredicates';
import { buildGroup } from './groups';
import type { PendingContext, PendingSourceAdapter, RawPendingRow } from './types';

const HELD = feePaymentUnsettled('fee_payment_reversals.paymentId');

/** Payment reversals push through FeeReversalSyncService and wait for their
 * payment's create to finish — the same gate the push uses. */
export class FeeReversalPendingSource implements PendingSourceAdapter {
  readonly source = 'fee_reversals' as const;

  summarize(ctx: PendingContext): PendingGroupSummary[] {
    const row = ctx.db.prepare(
      `SELECT COUNT(*) AS total, SUM(${HELD}) AS held, MIN(updatedAt) AS oldestAt
       FROM fee_payment_reversals WHERE ${FEE_REVERSAL_PENDING}`,
    ).get() as { total: number; held: number | null; oldestAt: string | null };
    if (row.total === 0 || !row.oldestAt) return [];
    const held = row.held ?? 0;
    return [buildGroup('fee_reversals', 'fee_payment_reversals', { waiting: row.total - held, held }, row.oldestAt)];
  }

  listRecords(ctx: PendingContext, entityType: string, limit: number, offset: number) {
    if (entityType !== 'fee_payment_reversals') return { rows: [], total: 0 };
    const rows = ctx.db.prepare(
      `SELECT *, ${HELD} AS isHeld FROM fee_payment_reversals
       WHERE ${FEE_REVERSAL_PENDING} ORDER BY updatedAt, id LIMIT ? OFFSET ?`,
    ).all(limit, offset) as Array<Record<string, unknown> & { id: string; updatedAt: string; isHeld: number }>;
    return {
      rows: rows.map(({ isHeld, ...row }): RawPendingRow => ({
        id: row.id,
        entityType: 'fee_payment_reversals',
        entityId: row.id,
        operationType: 'create',
        state: isHeld ? 'held' : 'waiting',
        createdAt: row.updatedAt,
        nextAttemptAt: null,
        retryCount: 0,
        lastError: null,
        payload: row,
      })),
      total: this.countPending(ctx),
    };
  }

  countPending(ctx: PendingContext): number {
    return (ctx.db.prepare(
      `SELECT COUNT(*) AS n FROM fee_payment_reversals WHERE ${FEE_REVERSAL_PENDING}`,
    ).get() as { n: number }).n;
  }

  countFailed(): number {
    return 0;
  }
}
