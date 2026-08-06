import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MigrationService } from './MigrationService';
import { DatabaseError } from '../errors/errors';
import { migrations } from '../migrations/registry';
import { createTestDatabase, type TestDatabase } from '../testing/createTestDatabase';
import { DatabaseHealthService } from './DatabaseHealthService';

describe('DatabaseHealthService', () => {
  let test: TestDatabase;
  let service: DatabaseHealthService;

  beforeEach(() => {
    test = createTestDatabase();
    new MigrationService(test.db.raw, migrations).migrateToLatest();
    service = new DatabaseHealthService(test.db.raw, test.filePath);
  });

  afterEach(() => {
    test.cleanup();
  });

  it('reports a healthy database', () => {
    const report = service.check();
    expect(report.ok).toBe(true);
    expect(report.quickCheck).toBe('ok');
    expect(report.foreignKeyViolations).toBe(0);
    expect(report.pageCount).toBeGreaterThan(0);
    expect(report.pageSize).toBeGreaterThan(0);
    expect(report.databaseSizeBytes).toBeGreaterThan(0);
    // Reflects the latest registered migration version.
    expect(report.schemaVersion).toBe(migrations.at(-1)?.version);
  });

  it('full integrity check passes on a healthy database', () => {
    const result = service.fullIntegrityCheck();
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('counts foreign key violations', () => {
    test.db.raw.pragma('foreign_keys = OFF');
    test.db.raw
      .prepare(
        `INSERT INTO sync_errors (id, operationId, message, createdAt)
         VALUES ('e1', 'missing-op', 'orphan', '2026-01-01T00:00:00Z')`,
      )
      .run();
    test.db.raw.pragma('foreign_keys = ON');
    const report = service.check();
    expect(report.foreignKeyViolations).toBeGreaterThan(0);
    expect(report.ok).toBe(false);
  });

  it('wraps driver failures from check() in the DatabaseError taxonomy', () => {
    // Sabotage: close the connection out from under the service so the
    // pragma call hits a real driver failure ("database connection is not
    // open"), which must surface as a DatabaseError, not a raw driver error.
    test.cleanup();
    expect(() => service.check()).toThrow(DatabaseError);
  });

  it('wraps driver failures from fullIntegrityCheck() in the DatabaseError taxonomy', () => {
    test.cleanup();
    expect(() => service.fullIntegrityCheck()).toThrow(DatabaseError);
  });
});
