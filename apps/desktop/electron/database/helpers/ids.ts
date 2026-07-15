import { randomUUID } from 'node:crypto';

/** UUID v4 primary keys — required for all rows; never auto-increment. */
export function newId(): string {
  return randomUUID();
}
