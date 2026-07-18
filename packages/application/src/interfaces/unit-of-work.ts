/** Synchronous transaction boundary. Mirrors the Phase-3 DAL TransactionRunner:
 * better-sqlite3 cannot await inside a transaction, so `work` MUST be synchronous.
 * Throwing inside `work` aborts (rolls back) the transaction. */
export interface IUnitOfWork {
  run<T>(work: () => T): T; // deferred BEGIN
  runImmediate<T>(work: () => T): T; // BEGIN IMMEDIATE
}
