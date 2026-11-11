import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { migrations } from './registry';

function migratedThrough(version: number): SqliteDatabase {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = OFF');
  for (const m of migrations.filter((x) => x.version <= version)) m.up(db);
  return db;
}

const columns = (db: SqliteDatabase) =>
  (db.pragma(`table_info(user_organizations)`) as { name: string }[]).map((c) => c.name);

describe('migration 048 add-user-organization-modules', () => {
  it('defaults modules to [] and title to NULL on a row inserted without them', () => {
    const db = migratedThrough(47);
    const m48 = migrations.find((m) => m.version === 48);
    expect(m48?.name).toBe('add-user-organization-modules');
    m48!.up(db);
    db.prepare(`INSERT INTO user_organizations (id, userId, role) VALUES ('o1', 'u1', 'INSTITUTION_STAFF')`).run();
    expect(db.prepare(`SELECT modules, title FROM user_organizations WHERE id = 'o1'`).get()).toEqual({
      modules: '[]',
      title: null,
    });
  });

  it('down removes both columns', () => {
    const db = migratedThrough(48);
    expect(columns(db)).toEqual(expect.arrayContaining(['modules', 'title']));
    migrations.find((m) => m.version === 48)!.down!(db);
    expect(columns(db)).not.toContain('modules');
    expect(columns(db)).not.toContain('title');
  });
});
