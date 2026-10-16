import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrations } from './registry';

type ColumnInfo = { name: string; notnull: number };

function migratedThrough(version: number): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const migration of migrations.filter((m) => m.version <= version)) migration.up(db);
  return db;
}

function nullableColumn(db: Database.Database, table: string, name: string): boolean {
  const column = (db.pragma(`table_info(${table})`) as ColumnInfo[]).find((c) => c.name === name);
  return column !== undefined && column.notnull === 0;
}

describe('migration 032 add-county-districts-columns', () => {
  it('adds the nullable district, user and school columns', () => {
    const db = migratedThrough(32);
    expect(nullableColumn(db, 'districts', 'code')).toBe(true);
    for (const name of ['phoneNumber', 'lastLoginAt', 'photoUrl', 'createdAt']) {
      expect(nullableColumn(db, 'users', name)).toBe(true);
    }
    for (const name of ['contactPhone', 'contactPersonPhone', 'emisCode', 'officialSchoolCode']) {
      expect(nullableColumn(db, 'institutions', name)).toBe(true);
    }
  });

  it('keeps existing rows', () => {
    const db = migratedThrough(31);
    db.prepare(`INSERT INTO districts (id,name,countyId) VALUES ('d-1','Buchanan','county-1')`).run();
    migrations.find((m) => m.version === 32)!.up(db);
    expect(db.prepare(`SELECT name, code FROM districts`).get()).toEqual({ name: 'Buchanan', code: null });
  });
});
