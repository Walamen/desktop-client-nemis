import type { EnqueueSyncOperationInput } from '../dto/platform';
import type { SyncQueueItem, SyncQueueStatus } from '../models/platform';
import type { ISyncQueueRepository } from '../repositories/interfaces/ISyncQueueRepository';
import type { TransactionRunner } from './TransactionRunner';

export interface SyncQueueServiceDeps {
  syncQueue: ISyncQueueRepository;
  transactions: TransactionRunner;
}

export class SyncQueueService {
  readonly #deps: SyncQueueServiceDeps;

  constructor(deps: SyncQueueServiceDeps) {
    this.#deps = deps;
  }

  enqueue(input: EnqueueSyncOperationInput): Promise<SyncQueueItem> {
    return Promise.resolve(this.#deps.syncQueue.enqueue(input));
  }

  nextBatch(limit: number): Promise<SyncQueueItem[]> {
    return Promise.resolve(this.#deps.syncQueue.nextBatch(limit));
  }

  /** Atomic claim: select + mark in_flight in one transaction (sync-worker API). */
  claim(limit: number): Promise<SyncQueueItem[]> {
    return Promise.resolve(this.#deps.syncQueue.claimBatch(limit));
  }

  complete(ids: string[]): Promise<number> {
    return Promise.resolve(this.#deps.syncQueue.markCompleted(ids));
  }

  /** Marks the operation failed and records its error atomically. */
  // async so a synchronous throw from transactions.run (e.g. translated
  // transaction-machinery failures) becomes a rejected promise rather than
  // escaping this method synchronously.
  async fail(id: string, error: { message: string; stack?: string }): Promise<SyncQueueItem> {
    return this.#deps.transactions.run(() => {
      const item = this.#deps.syncQueue.markFailed(id);
      this.#deps.syncQueue.recordError({
        operationId: id,
        message: error.message,
        stack: error.stack ?? null,
        retryCount: item.retryCount,
      });
      return item;
    });
  }

  scheduleRetry(id: string, nextAttemptAt: string): Promise<SyncQueueItem> {
    return Promise.resolve(this.#deps.syncQueue.scheduleRetry(id, nextAttemptAt));
  }

  countByStatus(status: SyncQueueStatus): Promise<number> {
    return Promise.resolve(this.#deps.syncQueue.countByStatus(status));
  }
}
