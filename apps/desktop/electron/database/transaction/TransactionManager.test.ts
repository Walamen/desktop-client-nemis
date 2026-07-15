import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../testing/createTestDatabase';
import { TransactionManager } from './TransactionManager';

describe('TransactionManager', () => {
  let test: TestDatabase;
  let tx: TransactionManager;

  beforeEach(() => {
    test = createTestDatabase();
    test.db.raw.exec('CREATE TABLE items (id TEXT PRIMARY KEY, label TEXT NOT NULL)');
    tx = new TransactionManager(test.db.raw);
  });

  afterEach(() => {
    test.cleanup();
  });

  const count = (): number =>
    (test.db.raw.prepare('SELECT COUNT(*) AS n FROM items').get() as { n: number }).n;

  it('commits when work succeeds and returns its result', () => {
    const result = tx.run(() => {
      test.db.raw.prepare("INSERT INTO items VALUES ('1', 'a')").run();
      return 42;
    });
    expect(result).toBe(42);
    expect(count()).toBe(1);
  });

  it('rolls back everything when work throws, rethrowing the original error', () => {
    const boom = new Error('domain failure');
    expect(() =>
      tx.run(() => {
        test.db.raw.prepare("INSERT INTO items VALUES ('1', 'a')").run();
        throw boom;
      }),
    ).toThrow(boom);
    expect(count()).toBe(0);
  });

  it('nests safely: inner failure caught by outer keeps outer work', () => {
    tx.run(() => {
      test.db.raw.prepare("INSERT INTO items VALUES ('outer', 'o')").run();
      try {
        tx.run(() => {
          test.db.raw.prepare("INSERT INTO items VALUES ('inner', 'i')").run();
          throw new Error('inner fails');
        });
      } catch {
        // inner savepoint rolled back; outer continues
      }
    });
    expect(count()).toBe(1);
    const row = test.db.raw.prepare('SELECT id FROM items').get() as { id: string };
    expect(row.id).toBe('outer');
  });

  it('runImmediate acquires a write transaction and commits', () => {
    tx.runImmediate(() => {
      test.db.raw.prepare("INSERT INTO items VALUES ('1', 'a')").run();
    });
    expect(count()).toBe(1);
  });
});
