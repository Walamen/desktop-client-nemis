import { describe, expect, it, vi } from 'vitest';
import type { RecordSyncErrorInput } from '../dto/platform';
import type { SyncError, SyncQueueItem } from '../models/platform';
import type { ISyncQueueRepository } from '../repositories/interfaces/ISyncQueueRepository';
import { SyncQueueService } from './SyncQueueService';
import type { TransactionRunner } from './TransactionRunner';

function makeItem(id: string, retryCount = 0): SyncQueueItem {
  return {
    id,
    entityType: 'student',
    entityId: 'e1',
    operationType: 'create',
    payload: null,
    retryCount,
    nextAttemptAt: null,
    deadLetter: false,
    status: 'pending',
    createdAt: 't0',
    updatedAt: 't0',
  };
}

describe('SyncQueueService', () => {
  it('fail marks the item failed and records the error in one transaction', async () => {
    const recorded: RecordSyncErrorInput[] = [];
    let inTransaction = false;
    let failedInTransaction = false;
    const repo = {
      markFailed: (id: string) => {
        failedInTransaction = inTransaction;
        return { ...makeItem(id, 1), status: 'failed' as const };
      },
      recordError: (input: RecordSyncErrorInput) => {
        recorded.push(input);
        return {
          id: 'err1',
          operationId: input.operationId,
          message: input.message,
          stack: input.stack ?? null,
          retryCount: input.retryCount ?? 0,
          createdAt: 't0',
        } satisfies SyncError;
      },
    } as Partial<ISyncQueueRepository> as ISyncQueueRepository;
    const transactions: TransactionRunner = {
      run: (work) => {
        inTransaction = true;
        try {
          return work();
        } finally {
          inTransaction = false;
        }
      },
      runImmediate: (work) => work(),
    };
    const service = new SyncQueueService({ syncQueue: repo, transactions });

    const item = await service.fail('q1', { message: 'network timeout', stack: 'at sync()' });

    expect(item.status).toBe('failed');
    expect(failedInTransaction).toBe(true);
    expect(recorded).toEqual([
      { operationId: 'q1', message: 'network timeout', stack: 'at sync()', retryCount: 1 },
    ]);
  });

  it('scheduleRetry delegates to the repository', async () => {
    const scheduleRetry = vi.fn((id: string, nextAttemptAt: string) => ({
      ...makeItem(id, 1),
      status: 'pending' as const,
      nextAttemptAt,
    }));
    const repo = {
      scheduleRetry,
    } as unknown as ISyncQueueRepository;
    const transactions: TransactionRunner = {
      run: (work) => work(),
      runImmediate: (work) => work(),
    };
    const service = new SyncQueueService({ syncQueue: repo, transactions });

    const result = await service.scheduleRetry('q1', '2026-07-29T00:05:00.000Z');

    expect(scheduleRetry).toHaveBeenCalledWith('q1', '2026-07-29T00:05:00.000Z');
    expect(result.nextAttemptAt).toBe('2026-07-29T00:05:00.000Z');
  });
});
