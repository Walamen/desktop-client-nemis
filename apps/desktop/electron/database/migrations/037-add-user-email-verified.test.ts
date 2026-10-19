import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrations } from './registry';

type ColumnInfo = { name: string };

describe('migration 037 add-user-email-verified', () => {
  it('adds a nullable users.emailVerified; existing rows read NULL; no triggers touched', () => {
    const db = new Database(':memory:');
    for (const migration of migrations.filter((m) => m.version <= 36)) migration.up(db);
    db.prepare(
      `INSERT INTO users (id,firstName,lastName,email,isActive,version,updatedAt)
       VALUES ('u-1','A','B','a@b.c',1,1,'2026-10-01T00:00:00.000Z')`,
    ).run();
    const triggers = () => db.prepare(`SELECT name, sql FROM sqlite_master WHERE type='trigger' ORDER BY name`).all();
    const before = triggers();

    migrations.find((m) => m.version === 37)!.up(db);

    expect((db.pragma('table_info(users)') as ColumnInfo[]).map((c) => c.name)).toContain('emailVerified');
    expect(db.prepare(`SELECT emailVerified FROM users WHERE id='u-1'`).get()).toEqual({ emailVerified: null });
    expect(triggers()).toEqual(before);
  });
});
