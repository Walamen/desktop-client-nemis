import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MigrationService } from '../services/MigrationService';
import { TableNames } from '../schema/tableNames';
import { createTestDatabase, type TestDatabase } from '../testing/createTestDatabase';
import { migrations } from './registry';

describe('001-create-platform-tables', () => {
  let test: TestDatabase;

  beforeEach(() => {
    test = createTestDatabase();
    new MigrationService(test.db.raw, migrations).migrateToLatest();
  });

  afterEach(() => {
    test.cleanup();
  });

  it('creates every platform table', () => {
    const names = (
      test.db.raw
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as Array<{ name: string }>
    ).map((row) => row.name);
    for (const table of [
      TableNames.devices,
      TableNames.appSettings,
      TableNames.syncMetadata,
      TableNames.syncQueue,
      TableNames.syncErrors,
      TableNames.auditLog,
    ]) {
      expect(names).toContain(table);
    }
  });

  it('creates the documented indexes', () => {
    const indexes = (
      test.db.raw
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
        .all() as Array<{ name: string }>
    ).map((row) => row.name);
    expect(indexes.sort()).toEqual([
      'idx_app_settings_key',
      'idx_audit_log_category_createdAt',
      'idx_sync_errors_createdAt',
      'idx_sync_errors_operationId',
      'idx_sync_queue_entity',
      'idx_sync_queue_status_createdAt',
    ]);
  });

  it('enforces sync_queue CHECK constraints', () => {
    const insert = test.db.raw.prepare(
      `INSERT INTO ${TableNames.syncQueue}
       (id, entityType, entityId, operationType, payload, createdAt, updatedAt)
       VALUES (?, 'student', 'e1', ?, '{}', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
    );
    expect(() => insert.run('q1', 'create')).not.toThrow();
    expect(() => insert.run('q2', 'upsert')).toThrow();
  });

  it('enforces the sync_metadata singleton CHECK', () => {
    expect(() =>
      test.db.raw
        .prepare(
          `INSERT INTO ${TableNames.syncMetadata}
           (id, schemaVersion, databaseVersion, syncStatus, createdAt, updatedAt)
           VALUES ('another-row', 1, 1, 'never', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
        )
        .run(),
    ).toThrow();
  });

  it('sync_errors.operationId nulls out when the queue row is deleted', () => {
    const now = '2026-01-01T00:00:00Z';
    test.db.raw
      .prepare(
        `INSERT INTO ${TableNames.syncQueue}
         (id, entityType, entityId, operationType, payload, createdAt, updatedAt)
         VALUES ('q1', 'student', 'e1', 'create', '{}', ?, ?)`,
      )
      .run(now, now);
    test.db.raw
      .prepare(
        `INSERT INTO ${TableNames.syncErrors} (id, operationId, message, createdAt)
         VALUES ('err1', 'q1', 'network unreachable', ?)`,
      )
      .run(now);
    test.db.raw.prepare(`DELETE FROM ${TableNames.syncQueue} WHERE id = 'q1'`).run();
    const row = test.db.raw
      .prepare(`SELECT operationId FROM ${TableNames.syncErrors} WHERE id = 'err1'`)
      .get() as { operationId: string | null };
    expect(row.operationId).toBeNull();
  });

  it('down() removes every platform table', () => {
    const service = new MigrationService(test.db.raw, migrations);
    service.rollbackLast();
    const count = test.db.raw
      .prepare(
        `SELECT COUNT(*) AS n FROM sqlite_master
         WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != ?`,
      )
      .get(TableNames.schemaMigrations) as { n: number };
    expect(count.n).toBe(0);
  });
});
