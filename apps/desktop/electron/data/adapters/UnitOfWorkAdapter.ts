import type { IUnitOfWork } from '@nemis-desktop/application';
import type { TransactionRunner } from '../services/TransactionRunner';

/** Maps the application's synchronous IUnitOfWork onto the DAL TransactionRunner. */
export class UnitOfWorkAdapter implements IUnitOfWork {
  constructor(private readonly transactions: TransactionRunner) {}
  run<T>(work: () => T): T {
    return this.transactions.run(work);
  }
  runImmediate<T>(work: () => T): T {
    return this.transactions.runImmediate(work);
  }
}
