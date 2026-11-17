import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrations } from './registry';

const STAMP = '2026-11-01T00:00:00.000Z';

function deviceAt51(scopeType: string) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const migration of migrations.filter((m) => m.version <= 51)) migration.up(db);
  db.prepare(
    `INSERT INTO sync_metadata (id, schemaVersion, databaseVersion, lastFullResyncAt, createdAt, updatedAt)
     VALUES ('singleton', 51, 51, ?, ?, ?)`,
  ).run(STAMP, STAMP, STAMP);
  db.prepare(
    `INSERT INTO provisioning_metadata (id, status, startedAt, updatedAt, scopeType)
     VALUES ('singleton', 'complete', ?, ?, ?)`,
  ).run(STAMP, STAMP, scopeType);
  return db;
}

describe('migration 052 resync-district-messages', () => {
  it('forces a full resync on a district device so it receives its conversations and County Admin', () => {
    const db = deviceAt51('DISTRICT');
    migrations.find((m) => m.version === 52)!.up(db);
    expect(db.prepare(`SELECT lastFullResyncAt FROM sync_metadata`).get()).toEqual({ lastFullResyncAt: null });
  });

  it('leaves every other device alone', () => {
    for (const scope of ['INSTITUTION', 'TEACHER', 'COUNTY']) {
      const db = deviceAt51(scope);
      migrations.find((m) => m.version === 52)!.up(db);
      expect(db.prepare(`SELECT lastFullResyncAt FROM sync_metadata`).get()).toEqual({ lastFullResyncAt: STAMP });
    }
  });
});
