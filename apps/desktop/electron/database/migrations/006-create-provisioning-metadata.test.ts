import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MigrationService } from '../services/MigrationService';
import { createTestDatabase, type TestDatabase } from '../testing/createTestDatabase';
import { migrations } from './registry';

describe('006-create-provisioning-metadata', () => {
  let test: TestDatabase;
  beforeEach(() => {
    test = createTestDatabase();
    new MigrationService(test.db.raw, migrations).migrateToLatest();
  });
  afterEach(() => test.cleanup());

  it('creates the singleton provisioning recovery table and status index', () => {
    const names = (test.db.raw
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','index')")
      .all() as { name: string }[]).map(({ name }) => name);
    expect(names).toContain('provisioning_metadata');
    expect(names).toContain('idx_provisioning_status');
    expect(() =>
      test.db.raw.prepare(`
        INSERT INTO provisioning_metadata (id,status,startedAt,updatedAt)
        VALUES ('singleton','in_progress','2026-01-01','2026-01-01')
      `).run(),
    ).not.toThrow();
  });
});
