import type { Database as SqliteDatabase } from 'better-sqlite3';
import { DatabaseError, TransactionError } from '../errors/errors';
import { wrapSqliteError } from '../errors/wrapSqliteError';

type TransactionMode = 'deferred' | 'immediate' | 'exclusive';

/**
 * Callback-scoped transactions over better-sqlite3's transaction().
 *
 * No begin()/commit()/rollback() handles are exposed on purpose: with a
 * callback API a forgotten-open transaction cannot exist, which extends the
 * platform's "no leaks" guarantee to transactions. Nested run* calls become
 * SAVEPOINTs automatically, so repository code composes freely.
 *
 * Errors thrown by `work` propagate unchanged (after rollback) so domain
 * errors keep their type; driver-level failures are wrapped in the taxonomy.
 */
export class TransactionManager {
  readonly #db: SqliteDatabase;

  constructor(db: SqliteDatabase) {
    this.#db = db;
  }

  /** DEFERRED transaction (default): lock escalates on first write. */
  run<T>(work: () => T): T {
    return this.#exec(work, 'deferred');
  }

  /** IMMEDIATE: takes the write lock up front; use for known write batches. */
  runImmediate<T>(work: () => T): T {
    return this.#exec(work, 'immediate');
  }

  /** EXCLUSIVE: blocks all other connections; reserve for maintenance. */
  runExclusive<T>(work: () => T): T {
    return this.#exec(work, 'exclusive');
  }

  #exec<T>(work: () => T, mode: TransactionMode): T {
    let inWork = false;
    const marked = (): T => {
      inWork = true;
      try {
        return work();
      } finally {
        inWork = false;
      }
    };
    try {
      const transaction = this.#db.transaction(marked);
      switch (mode) {
        case 'deferred':
          return transaction.deferred();
        case 'immediate':
          return transaction.immediate();
        case 'exclusive':
          return transaction.exclusive();
      }
    } catch (error) {
      if (inWork || error instanceof DatabaseError) {
        throw error; // work's own error (already rolled back) or already wrapped
      }
      if (error instanceof Error && 'code' in error) {
        throw wrapSqliteError(error, `transaction (${mode})`);
      }
      if (error instanceof Error) {
        throw error;
      }
      throw new TransactionError(`transaction (${mode}) failed`, { cause: error });
    }
  }
}
