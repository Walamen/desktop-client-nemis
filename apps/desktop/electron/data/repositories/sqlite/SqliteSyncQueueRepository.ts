import { newId } from '../../../database/helpers/ids';
import { nowIso } from '../../../database/helpers/time';
import { TableNames } from '../../../database/schema/tableNames';
import type { EnqueueSyncOperationInput, RecordSyncErrorInput } from '../../dto/platform';
import { serializeJsonColumn } from '../../mappers/json';
import {
  syncErrorMapper,
  syncQueueMapper,
  type SyncErrorRow,
  type SyncQueueRow,
} from '../../mappers/platformMappers';
import type { SyncError, SyncQueueItem, SyncQueueStatus } from '../../models/platform';
import { deleteFrom, insertInto, select } from '../../queries/builders';
import { chunkArray, DEFAULT_PARAMETER_CHUNK_SIZE } from '../../queries/chunk';
import { and, eq, inList, isNull, lt, lte, or } from '../../queries/predicates';
import { validateEnqueue, validatePurge, validateRecordSyncError } from '../../validators/platform';
import { BaseRepository } from '../base/BaseRepository';
import type { RepositoryContext } from '../base/RepositoryContext';
import type { ISyncQueueRepository } from '../interfaces/ISyncQueueRepository';

const SYNC_QUEUE_COLUMNS = [
  'id',
  'entityType',
  'entityId',
  'operationType',
  'payload',
  'retryCount',
  'nextAttemptAt',
  'deadLetter',
  'status',
  'createdAt',
  'updatedAt',
  'seq',
] as const;

/** Lowest seq of a backed-off pending row. Every row written after it waits
 * (nextBatch), so a student's guardian link and enrolment are never pushed
 * before the student. Shared with the Pending changes page's "held" state.
 * Bind: now (ISO). */
export const OUTBOX_BLOCKER_SQL = `SELECT MIN(seq) AS blocker FROM sync_queue
         WHERE status = 'pending' AND deadLetter = 0
           AND nextAttemptAt IS NOT NULL AND nextAttemptAt > ?`;

const recordKey = (entityType: string, entityId: string): string => `${entityType}:${entityId}`;

export class SqliteSyncQueueRepository
  extends BaseRepository<SyncQueueRow, SyncQueueItem>
  implements ISyncQueueRepository
{
  constructor(context: RepositoryContext) {
    super(context, {
      table: TableNames.syncQueue,
      entityName: 'SyncQueueItem',
      columns: SYNC_QUEUE_COLUMNS,
      mapper: syncQueueMapper,
    });
  }

  enqueue(input: EnqueueSyncOperationInput): SyncQueueItem {
    this.validate(validateEnqueue, input);
    const now = nowIso();
    // Same MAX(seq)+1 the outbox triggers use, so a manually enqueued row sorts
    // after earlier ones instead of NULL-first.
    const { n } = this.statements
      .get(`SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM sync_queue`)
      .get() as { n: number };
    return this.insertRow({
      id: newId(),
      entityType: input.entityType,
      entityId: input.entityId,
      operationType: input.operationType,
      payload: serializeJsonColumn(input.payload, 'sync_queue.payload'),
      retryCount: 0,
      nextAttemptAt: null,
      deadLetter: 0,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      seq: n,
    });
  }

  enqueueMany(inputs: readonly EnqueueSyncOperationInput[]): SyncQueueItem[] {
    for (const input of inputs) {
      this.validate(validateEnqueue, input);
    }
    if (inputs.length === 0) {
      return [];
    }
    return this.query('enqueueMany', () =>
      // IMMEDIATE: a known write batch takes the write lock up front.
      this.context.transactions.runImmediate(() => inputs.map((input) => this.enqueue(input))),
    );
  }

  nextBatch(limit: number): SyncQueueItem[] {
    const now = nowIso();
    // A backed-off row holds back every row written after it: its dependants
    // (a student's guardian link and enrolment) would otherwise be pushed
    // first and rejected. Only pending rows block — a dead-lettered row is
    // 'failed' and never retries on its own, so it must not stall the queue.
    const { blocker } = this.statements
      .get(OUTBOX_BLOCKER_SQL)
      .get(now) as { blocker: number | null };
    const due = and(eq('status', 'pending'), or(isNull('nextAttemptAt'), lte('nextAttemptAt', now)));
    const dueRows = this.selectWhere(
      'nextBatch',
      blocker === null ? due : and(due, or(isNull('seq'), lt('seq', blocker))),
      {
        orderBy: [
          // Write order (migration 026). createdAt/id only break the tie for
          // a row that somehow has no seq — none should after the backfill.
          { column: 'seq', direction: 'asc' },
          { column: 'createdAt', direction: 'asc' },
          { column: 'id', direction: 'asc' },
        ],
        page: { limit, offset: 0 },
      },
    );
    // One change per record per batch, never reordered: the batch is the due
    // rows in seq order up to the first one whose record is already in it or
    // has a change in flight. Stop, never skip — a later row for another
    // record must not jump the held-back one, and a later change must not
    // reach the server before the earlier one's result is known.
    const inFlight = this.statements
      .get(`SELECT entityType, entityId FROM sync_queue WHERE status = 'in_flight'`)
      .all() as Array<{ entityType: string; entityId: string }>;
    const seen = new Set(inFlight.map((row) => recordKey(row.entityType, row.entityId)));
    const batch: SyncQueueItem[] = [];
    for (const row of dueRows) {
      const key = recordKey(row.entityType, row.entityId);
      if (seen.has(key)) {
        break;
      }
      seen.add(key);
      batch.push(row);
    }
    return batch;
  }

  claimBatch(limit: number): SyncQueueItem[] {
    return this.query('claimBatch', () =>
      // IMMEDIATE: the write lock is held before the select — see interface doc.
      this.context.transactions.runImmediate(() => {
        const pending = this.nextBatch(limit);
        if (pending.length === 0) {
          return [];
        }
        const ids = pending.map((item) => item.id);
        this.#markSent(ids, 'claimBatch');
        // One re-read for the whole batch instead of N findByIdOrThrow round
        // trips; same seq,createdAt,id ordering as nextBatch so return order stays stable.
        return this.selectWhere('claimBatch', inList('id', ids), {
          orderBy: [
            { column: 'seq', direction: 'asc' },
            { column: 'createdAt', direction: 'asc' },
            { column: 'id', direction: 'asc' },
          ],
        });
      }),
    );
  }

  markInFlight(ids: readonly string[]): number {
    return this.#markSent(ids, 'markInFlight');
  }

  markCompleted(ids: readonly string[]): number {
    return this.#setStatus(ids, 'completed', 'markCompleted');
  }

  markFailed(id: string): SyncQueueItem {
    return this.executeTransaction(() => {
      const current = this.findByIdOrThrow(id);
      return this.updateById(id, {
        status: 'failed',
        retryCount: current.retryCount + 1,
        updatedAt: nowIso(),
      });
    });
  }

  scheduleRetry(id: string, nextAttemptAt: string): SyncQueueItem {
    return this.executeTransaction(() => {
      const current = this.findByIdOrThrow(id);
      return this.updateById(id, {
        status: 'pending',
        retryCount: current.retryCount + 1,
        nextAttemptAt,
        updatedAt: nowIso(),
      });
    });
  }

  countByStatus(status: SyncQueueStatus): number {
    return this.count(eq('status', status));
  }

  purgeCompleted(olderThan: string): number {
    this.validate(validatePurge, { olderThan });
    return this.query('purgeCompleted', () => {
      const built = deleteFrom(TableNames.syncQueue)
        .where(and(eq('status', 'completed'), lt('createdAt', olderThan)))
        .build();
      return this.statements.get(built.sql).run(...built.params).changes;
    });
  }

  recordError(input: RecordSyncErrorInput): SyncError {
    this.validate(validateRecordSyncError, input);
    return this.query('recordError', () => {
      const row: SyncErrorRow = {
        id: newId(),
        operationId: input.operationId,
        message: input.message,
        stack: input.stack ?? null,
        retryCount: input.retryCount ?? 0,
        createdAt: nowIso(),
      };
      const built = insertInto(TableNames.syncErrors)
        .values({ ...row })
        .build();
      this.statements.get(built.sql).run(...built.params);
      return syncErrorMapper.toModel(row);
    });
  }

  errorsForOperation(operationId: string): SyncError[] {
    return this.query('errorsForOperation', () => {
      const built = select(TableNames.syncErrors)
        .where(eq('operationId', operationId))
        .orderBy('createdAt')
        .orderBy('id')
        .build();
      const rows = this.statements.get(built.sql).all(...built.params) as SyncErrorRow[];
      return rows.map((row) => syncErrorMapper.toModel(row));
    });
  }

  /** Marks rows in_flight and stamps `sentAt` on those never sent before. A
   * row that was ever sent is never an outbox merge target again (migration
   * 047): its id is the server's operationId, and the server answers a
   * repeated operationId with its first receipt without applying the payload. */
  #markSent(ids: readonly string[], operation: string): number {
    return this.query(operation, () =>
      this.context.transactions.runImmediate(() => {
        const now = nowIso();
        const changed = this.updateByIds(ids, { status: 'in_flight', updatedAt: now });
        for (const chunk of chunkArray(ids, DEFAULT_PARAMETER_CHUNK_SIZE)) {
          this.statements
            .get(
              `UPDATE sync_queue SET sentAt = ? WHERE sentAt IS NULL AND id IN (${chunk.map(() => '?').join(',')})`,
            )
            .run(now, ...chunk);
        }
        return changed;
      }),
    );
  }

  #setStatus(ids: readonly string[], status: SyncQueueStatus, operation: string): number {
    return this.query(operation, () => this.updateByIds(ids, { status, updatedAt: nowIso() }));
  }
}
