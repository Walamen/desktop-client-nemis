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
import { deleteFrom, insertInto, select, updateTable } from '../../queries/builders';
import { and, eq, inList, lt } from '../../queries/predicates';
import {
  validateEnqueue,
  validatePurge,
  validateRecordSyncError,
} from '../../validators/platform';
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
  'status',
  'createdAt',
  'updatedAt',
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
    return this.insertRow({
      id: newId(),
      entityType: input.entityType,
      entityId: input.entityId,
      operationType: input.operationType,
      payload: serializeJsonColumn(input.payload, 'sync_queue.payload'),
      retryCount: 0,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
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
    return this.selectWhere('nextBatch', eq('status', 'pending'), {
      orderBy: [
        { column: 'createdAt', direction: 'asc' },
        { column: 'id', direction: 'asc' },
      ],
      page: { limit, offset: 0 },
    });
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
    if (ids.length === 0) {
      return 0;
    }
    return this.query(operation, () => {
      const built = updateTable(TableNames.syncQueue)
        .set({ status, updatedAt: nowIso() })
        .where(inList('id', ids))
        .build();
      return this.statements.get(built.sql).run(...built.params).changes;
    });
  }
}
