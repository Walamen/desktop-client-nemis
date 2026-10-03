import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrations } from './registry';

function migrated() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const migration of migrations) migration.up(db);
  return db;
}

function insert(db: Database.Database, id: string, studentId: string, yearId: string) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO grade_completions
       (id, studentId, institutionId, academicYearId, gradeLevel, outcome, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?,?)`,
  ).run(id, studentId, 'school-1', yearId, 'GRADE_7', 'PROMOTED', now, now);
}

describe('029-create-grade-completions', () => {
  it('creates the table with the server columns plus sync tracking', () => {
    const db = migrated();
    const columns = (db.prepare(`PRAGMA table_info("grade_completions")`).all() as { name: string }[]).map((c) => c.name);
    expect(columns).toEqual(expect.arrayContaining([
      'id', 'studentId', 'institutionId', 'academicYearId', 'gradeLevel', 'outcome', 'nextGradeLevel',
      'averageAtDecision', 'notes', 'decidedBy', 'amendedBy', 'amendedAt', 'createdAt', 'updatedAt',
      'syncState', 'syncError',
    ]));
    insert(db, 'g1', 's1', 'ay-1');
    expect(db.prepare(`SELECT syncState, syncError FROM grade_completions WHERE id='g1'`).get())
      .toEqual({ syncState: 'synced', syncError: null });
    db.close();
  });

  it('enforces one stamp per (studentId, academicYearId)', () => {
    const db = migrated();
    insert(db, 'g1', 's1', 'ay-1');
    expect(() => insert(db, 'g2', 's1', 'ay-1')).toThrow(/UNIQUE/);
    insert(db, 'g3', 's1', 'ay-2');
    db.close();
  });

  it('has no foreign key to students, so a stamp for an absent child stores', () => {
    const db = migrated();
    expect(db.prepare(`PRAGMA foreign_key_list("grade_completions")`).all()).toEqual([]);
    insert(db, 'g1', 'no-such-student', 'ay-1');
    db.close();
  });

  it('installs no outbox triggers', () => {
    const db = migrated();
    expect(db.prepare(`SELECT count(*) c FROM sqlite_master WHERE type='trigger' AND tbl_name='grade_completions'`).get())
      .toEqual({ c: 0 });
    db.close();
  });

  it('resets lastFullResyncAt so the next sync is a full resync', () => {
    const db = new Database(':memory:');
    for (const migration of migrations.filter((m) => m.version < 29)) migration.up(db);
    db.prepare("INSERT INTO sync_metadata (id, schemaVersion, databaseVersion, createdAt, updatedAt, lastFullResyncAt) VALUES ('singleton', 1, 1, 'x', 'x', ?)").run('2026-10-01T00:00:00.000Z');
    migrations.find((m) => m.version === 29)!.up(db);
    expect(db.prepare("SELECT lastFullResyncAt FROM sync_metadata WHERE id='singleton'").get())
      .toEqual({ lastFullResyncAt: null });
    db.close();
  });
});
