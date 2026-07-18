import type { IClock } from '../interfaces/clock';

export class SystemClock implements IClock {
  now(): string {
    return new Date().toISOString();
  }
}
