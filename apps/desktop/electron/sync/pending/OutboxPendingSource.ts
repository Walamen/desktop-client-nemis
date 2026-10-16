import { OUTBOX_BLOCKER_SQL } from '@app/data/repositories/sqlite/SqliteSyncQueueRepository';
import type { PendingGroupSummary, PendingItemState } from '@nemis-desktop/types';
import { buildGroup } from './groups';
import { parsePayload, type PendingContext, type PendingSourceAdapter, type RawPendingRow } from './types';

/** Mirrors SqliteSyncQueueRepository.nextBatch: a due row with seq above the
 * blocker is held, not waiting. Order matters — a held row that is itself
 * backed off reports 'retrying'. */
const STATE_SQL = `CASE
  WHEN q.status = 'in_flight' THEN 'sending'
  WHEN q.nextAttemptAt IS NOT NULL AND q.nextAttemptAt > @now THEN 'retrying'
  WHEN @blocker IS NOT NULL AND q.seq IS NOT NULL AND q.seq > @blocker THEN 'held'
  ELSE 'waiting'
END`;
const OPEN = `q.status IN ('pending','in_flight')`;

interface SummaryRow {
  entityType: string;
  sending: number;
  waiting: number;
  retrying: number;
  held: number;
  oldestAt: string;
}

interface RecordRow {
  id: string;
  entityType: string;
  entityId: string;
  operationType: RawPendingRow['operationType'];
  payload: string | null;
  createdAt: string;
  nextAttemptAt: string | null;
  retryCount: number;
  state: PendingItemState;
  lastError: string | null;
}

export class OutboxPendingSource implements PendingSourceAdapter {
  readonly source = 'outbox' as const;

  summarize(ctx: PendingContext): PendingGroupSummary[] {
    const rows = ctx.db.prepare(`
      SELECT entityType,
             SUM(state = 'sending') AS sending, SUM(state = 'waiting') AS waiting,
             SUM(state = 'retrying') AS retrying, SUM(state = 'held') AS held,
             MIN(createdAt) AS oldestAt
      FROM (SELECT q.entityType, q.createdAt, ${STATE_SQL} AS state FROM sync_queue q WHERE ${OPEN})
      GROUP BY entityType
    `).all(this.#params(ctx)) as SummaryRow[];
    return rows.map((row) =>
      buildGroup('outbox', row.entityType, {
        sending: row.sending, waiting: row.waiting, retrying: row.retrying, held: row.held,
      }, row.oldestAt),
    );
  }

  listRecords(ctx: PendingContext, entityType: string, limit: number, offset: number) {
    const params = { ...this.#params(ctx), entityType, limit, offset };
    const rows = ctx.db.prepare(`
      SELECT q.id, q.entityType, q.entityId, q.operationType, q.payload, q.createdAt,
             q.nextAttemptAt, q.retryCount, ${STATE_SQL} AS state,
             (SELECT e.message FROM sync_errors e WHERE e.operationId = q.id
              ORDER BY e.createdAt DESC, e.id DESC LIMIT 1) AS lastError
      FROM sync_queue q
      WHERE ${OPEN} AND q.entityType = @entityType
      ORDER BY q.seq, q.createdAt, q.id
      LIMIT @limit OFFSET @offset
    `).all(params) as RecordRow[];
    const { total } = ctx.db.prepare(
      `SELECT COUNT(*) AS total FROM sync_queue q WHERE ${OPEN} AND q.entityType = ?`,
    ).get(entityType) as { total: number };
    return {
      rows: rows.map((row): RawPendingRow => ({ ...row, payload: parsePayload(row.payload) })),
      total,
    };
  }

  countPending(ctx: PendingContext): number {
    return (ctx.db.prepare(
      `SELECT COUNT(*) AS n FROM sync_queue WHERE status IN ('pending','in_flight')`,
    ).get() as { n: number }).n;
  }

  countFailed(ctx: PendingContext): number {
    return (ctx.db.prepare(
      `SELECT COUNT(*) AS n FROM sync_queue WHERE status = 'failed' AND deadLetter = 1`,
    ).get() as { n: number }).n;
  }

  #params(ctx: PendingContext): { now: string; blocker: number | null } {
    const { blocker } = ctx.db.prepare(OUTBOX_BLOCKER_SQL).get(ctx.now) as { blocker: number | null };
    return { now: ctx.now, blocker };
  }
}
