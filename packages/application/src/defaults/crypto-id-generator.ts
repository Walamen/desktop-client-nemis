import type { IIdGenerator } from '../interfaces/id-generator';

/** Uses the Web Crypto UUID available as a Node global (v18+). */
export class CryptoIdGenerator implements IIdGenerator {
  next(): string {
    return crypto.randomUUID();
  }
}
