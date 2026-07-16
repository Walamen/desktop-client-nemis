import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { DatabaseLogger, DatabaseManager } from '../../../database/DatabaseManager';
import type { TransactionManager } from '../../../database/transaction/TransactionManager';

/** The narrow view of the database platform repositories are allowed to touch. */
export interface RepositoryContext {
  readonly connection: SqliteDatabase;
  readonly transactions: TransactionManager;
  readonly log: DatabaseLogger;
}

/**
 * The only sanctioned wiring: repositories consume DatabaseManager.connection
 * and .transactions — they never construct a Database or open a connection.
 * Live getters keep the manager's ready-state checks in the path.
 */
export function createRepositoryContext(
  manager: DatabaseManager,
  log: DatabaseLogger,
): RepositoryContext {
  return {
    get connection(): SqliteDatabase {
      return manager.connection;
    },
    get transactions(): TransactionManager {
      return manager.transactions;
    },
    log,
  };
}
