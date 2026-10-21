import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrations } from './registry';

type ColumnInfo = { name: string };

describe('migration 039 create-audit-logs', () => {
  it('creates the pull-only audit table, adds the county dates, and forces a full resync', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    for (const migration of migrations.filter((m) => m.version <= 38)) migration.up(db);
    db.prepare(
      `INSERT INTO sync_metadata (id, schemaVersion, databaseVersion, lastFullResyncAt, createdAt, updatedAt)
       VALUES ('singleton', 38, 38, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')`,
    ).run();
    db.prepare(`INSERT INTO counties (id, code, name) VALUES ('c-1', 'GB', 'Grand Bassa')`).run();

    migrations.find((m) => m.version === 39)!.up(db);

    expect((db.pragma('table_info(audit_logs)') as ColumnInfo[]).map((c) => c.name)).toEqual([
      'id', 'userId', 'action', 'entityType', 'entityId', 'timestamp', 'actorName', 'actorScope',
    ]);
    expect((db.pragma('table_info(counties)') as ColumnInfo[]).map((c) => c.name)).toEqual([
      'id', 'code', 'name', 'isActive', 'createdAt', 'updatedAt',
    ]);
    expect(db.prepare(`SELECT isActive, createdAt FROM counties`).get()).toEqual({ isActive: 1, createdAt: null });
    const triggers = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name = 'audit_logs'`)
      .all();
    expect(triggers).toEqual([]);
    const indexes = db.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name = 'audit_logs'`).all();
    expect(indexes).toContainEqual({ name: 'idx_audit_logs_timestamp' });
    expect(db.prepare(`SELECT lastFullResyncAt FROM sync_metadata`).get()).toEqual({ lastFullResyncAt: null });
  });
});
