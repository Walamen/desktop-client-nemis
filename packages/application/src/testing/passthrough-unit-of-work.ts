import type { IUnitOfWork } from '../interfaces/unit-of-work';

/** Runs the closure inline (no real transaction). Records how many times each
 * entry point ran so tests can assert a write happened transactionally. */
export class PassthroughUnitOfWork implements IUnitOfWork {
  runCount = 0;
  runImmediateCount = 0;
  run<T>(work: () => T): T {
    this.runCount += 1;
    return work();
  }
  runImmediate<T>(work: () => T): T {
    this.runImmediateCount += 1;
    return work();
  }
}
