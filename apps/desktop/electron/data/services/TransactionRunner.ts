/**
 * The minimal transaction surface services depend on. The platform's
 * TransactionManager satisfies it structurally; tests substitute a
 * pass-through.
 */
export interface TransactionRunner {
  run<T>(work: () => T): T;
  runImmediate<T>(work: () => T): T;
}
