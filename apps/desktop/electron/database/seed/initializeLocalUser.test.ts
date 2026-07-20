import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MigrationService } from '../services/MigrationService';
import { migrations } from '../migrations/registry';
import { TableNames } from '../schema/tableNames';
import { createTestDatabase, type TestDatabase } from '../testing/createTestDatabase';
import { initializeLocalUser } from './initializeLocalUser';

describe('initializeLocalUser', () => {
  let test: TestDatabase;

  beforeEach(() => {
    test = createTestDatabase();
    new MigrationService(test.db.raw, migrations).migrateToLatest();
  });

  afterEach(() => {
    test.cleanup();
  });

  it('creates exactly one user and one organization on first run', () => {
    const result = initializeLocalUser(test.db.raw);
    expect(result.userCreated).toBe(true);
    const users = test.db.raw.prepare(`SELECT COUNT(*) AS n FROM ${TableNames.users}`).get() as {
      n: number;
    };
    const orgs = test.db.raw
      .prepare(`SELECT COUNT(*) AS n FROM ${TableNames.userOrganizations}`)
      .get() as { n: number };
    expect(users.n).toBe(1);
    expect(orgs.n).toBe(1);
  });

  it('is idempotent — a second run creates nothing new', () => {
    const first = initializeLocalUser(test.db.raw);
    const second = initializeLocalUser(test.db.raw);
    expect(second.userCreated).toBe(false);
    expect(second.userId).toBe(first.userId);
    const users = test.db.raw.prepare(`SELECT COUNT(*) AS n FROM ${TableNames.users}`).get() as {
      n: number;
    };
    expect(users.n).toBe(1);
  });
});
