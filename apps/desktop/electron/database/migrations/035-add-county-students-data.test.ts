import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrations } from './registry';

type ColumnInfo = { name: string; notnull: number };

describe('migration 035 add-county-students-data', () => {
  it('adds term_averages without outbox triggers, the two student columns, and forces a full resync', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    for (const migration of migrations.filter((m) => m.version <= 34)) migration.up(db);
    db.prepare(
      `INSERT INTO sync_metadata (id, schemaVersion, databaseVersion, lastFullResyncAt, createdAt, updatedAt)
       VALUES ('singleton', 34, 34, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')`,
    ).run();
    migrations.find((m) => m.version === 35)!.up(db);

    expect((db.pragma('table_info(term_averages)') as ColumnInfo[]).map((c) => [c.name, c.notnull])).toEqual([
      ['id', 0],
      ['studentId', 1],
      ['subjectId', 1],
      ['termId', 1],
      ['classId', 1],
      ['percentage', 1],
      ['calculatedAt', 1],
      ['updatedAt', 1],
    ]);
    expect(
      db.prepare(`SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='term_averages'`).all(),
    ).toEqual([]);
    const studentColumns = (db.pragma('table_info(students)') as ColumnInfo[]).map((c) => c.name);
    expect(studentColumns).toEqual(expect.arrayContaining(['nationalId', 'photoUrl']));
    expect(db.prepare(`SELECT lastFullResyncAt FROM sync_metadata`).get()).toEqual({ lastFullResyncAt: null });
  });
});
