import type { IClock } from '../interfaces/clock';

export class FixedClock implements IClock {
  constructor(private readonly iso: string) {}
  now(): string {
    return this.iso;
  }
}
