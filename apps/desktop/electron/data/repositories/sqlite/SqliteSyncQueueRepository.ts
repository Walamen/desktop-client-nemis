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
    return this.selectWhere(
      'nextBatch',
      and(eq('status', 'pending'), or(isNull('nextAttemptAt'), lte('nextAttemptAt', nowIso()))),
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
        this.updateByIds(ids, { status: 'in_flight', updatedAt: nowIso() });
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
    return this.#setStatus(ids, 'in_flight', 'markInFlight');
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

  #setStatus(ids: readonly string[], status: SyncQueueStatus, operation: string): number {
    return this.query(operation, () => this.updateByIds(ids, { status, updatedAt: nowIso() }));
  }
}
