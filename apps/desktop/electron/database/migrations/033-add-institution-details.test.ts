import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrations } from './registry';

type ColumnInfo = { name: string; notnull: number };

describe('migration 033 add-institution-details', () => {
  it('adds a nullable JSON details column and keeps existing schools', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    for (const migration of migrations.filter((m) => m.version <= 32)) migration.up(db);
    db.prepare(
      `INSERT INTO institutions (id,code,name,type,ownership,countyId,approvalStatus,version,updatedAt)
       VALUES ('s-1','S1','School','SCHOOL','PUBLIC','county-1','APPROVED',1,'2026-01-01T00:00:00.000Z')`,
    ).run();
    migrations.find((m) => m.version === 33)!.up(db);
    const column = (db.pragma('table_info(institutions)') as ColumnInfo[]).find((c) => c.name === 'details');
    expect(column).toMatchObject({ notnull: 0 });
    expect(db.prepare(`SELECT name, details FROM institutions`).get()).toEqual({ name: 'School', details: null });
  });
});
