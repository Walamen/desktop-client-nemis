import type { IIdGenerator } from '../interfaces/id-generator';

/** Deterministic ids for tests: id-1, id-2, … (optional prefix). */
export class SequentialIdGenerator implements IIdGenerator {
  private n = 0;
  constructor(private readonly prefix = 'id') {}
  next(): string {
    this.n += 1;
    return `${this.prefix}-${this.n}`;
  }
}
