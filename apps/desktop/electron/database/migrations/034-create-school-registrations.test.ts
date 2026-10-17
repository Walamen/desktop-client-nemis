import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrations } from './registry';

type ColumnInfo = { name: string; notnull: number };

function migrated(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const migration of migrations.filter((m) => m.version <= 34)) migration.up(db);
  return db;
}

const insert = `INSERT INTO school_registrations (id,countyId,createdBy,source,payload,syncState,createdAt,updatedAt)
  VALUES (?,'c-1','u-1','form','{}',?,'2026-10-17T00:00:00.000Z','2026-10-17T00:00:00.000Z')`;

describe('migration 034 create-school-registrations', () => {
  it('creates school_registrations with no outbox triggers', () => {
    const db = migrated();
    const columns = (db.pragma('table_info(school_registrations)') as ColumnInfo[]).map((c) => [c.name, c.notnull]);
    expect(columns).toEqual([
      ['id', 0],
      ['countyId', 1],
      ['createdBy', 1],
      ['source', 1],
      ['payload', 1],
      ['syncState', 1],
      ['syncError', 0],
      ['principalEmail', 0],
      ['principalPassword', 0],
      ['createdAt', 1],
      ['updatedAt', 1],
      ['syncedAt', 0],
    ]);
    expect(
      db.prepare(`SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='school_registrations'`).all(),
    ).toEqual([]);
    db.prepare(insert).run('r-1', 'pending');
    expect(db.prepare(`SELECT COUNT(*) n FROM sync_queue`).get()).toEqual({ n: 0 });
  });

  it('rejects an unknown syncState', () => {
    const db = migrated();
    expect(() => db.prepare(insert).run('r-1', 'lost')).toThrow(/CHECK constraint/);
  });
});
