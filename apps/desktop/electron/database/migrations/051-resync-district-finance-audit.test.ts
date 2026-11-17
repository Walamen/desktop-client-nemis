import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrations } from './registry';

const STAMP = '2026-11-01T00:00:00.000Z';

function deviceAt50(scopeType: string) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const migration of migrations.filter((m) => m.version <= 50)) migration.up(db);
  db.prepare(
    `INSERT INTO sync_metadata (id, schemaVersion, databaseVersion, lastFullResyncAt, createdAt, updatedAt)
     VALUES ('singleton', 50, 50, ?, ?, ?)`,
  ).run(STAMP, STAMP, STAMP);
  db.prepare(
    `INSERT INTO provisioning_metadata (id, status, startedAt, updatedAt, scopeType)
     VALUES ('singleton', 'complete', ?, ?, ?)`,
  ).run(STAMP, STAMP, scopeType);
  return db;
}

describe('migration 051 resync-district-finance-audit', () => {
  it('forces a full resync on a district device so it receives the finance audit history', () => {
    const db = deviceAt50('DISTRICT');
    migrations.find((m) => m.version === 51)!.up(db);
    expect(db.prepare(`SELECT lastFullResyncAt FROM sync_metadata`).get()).toEqual({ lastFullResyncAt: null });
  });

  it('leaves every other device alone', () => {
    for (const scope of ['INSTITUTION', 'TEACHER', 'COUNTY']) {
      const db = deviceAt50(scope);
      migrations.find((m) => m.version === 51)!.up(db);
      expect(db.prepare(`SELECT lastFullResyncAt FROM sync_metadata`).get()).toEqual({ lastFullResyncAt: STAMP });
    }
  });
});
