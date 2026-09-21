import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrations } from './registry';

function migrated() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = OFF');
  for (const migration of migrations) migration.up(db);
  return db;
}

function insertStudent(db: Database.Database, id: string, nemisId: string | null) {
  db.prepare(
    `INSERT INTO students
       (id, institutionId, firstName, lastName, nemisId, dateOfBirth, gender,
        isActive, version, updatedAt)
     VALUES (?,?,?,?,?,?,?,1,1,?)`,
  ).run(id, 'school-1', 'Musu', 'Kollie', nemisId, '2012-04-01', 'FEMALE',
        new Date().toISOString());
}

describe('024-replace-admission-number-with-nemis-id', () => {
  it('replaces admissionNumber with nemisId on students', () => {
    const db = migrated();
    const columns = (db.prepare(`PRAGMA table_info("students")`).all() as { name: string }[])
      .map((column) => column.name);
    expect(columns).toContain('nemisId');
    expect(columns).not.toContain('admissionNumber');
    db.close();
  });

  it('enforces uniqueness on nemisId but permits many NULLs', () => {
    const db = migrated();
    insertStudent(db, 's1', '482915736045');
    expect(() => insertStudent(db, 's2', '482915736045')).toThrow(/UNIQUE/i);
    // Rows pulled before the server backfill land here with NULL and are
    // filled by the next sync; SQLite allows multiple NULLs in a unique index.
    insertStudent(db, 's3', null);
    insertStudent(db, 's4', null);
    expect(db.prepare(`SELECT count(*) c FROM students`).get()).toEqual({ c: 3 });
    db.close();
  });

  it('regenerates outbox triggers against the new column list', () => {
    const db = migrated();
    db.prepare(`UPDATE sync_runtime SET captureEnabled = 1 WHERE id = 'singleton'`).run();
    insertStudent(db, 's1', '482915736045');

    const queued = db
      .prepare(`SELECT payload FROM sync_queue WHERE entityType = 'students'`)
      .get() as { payload: string } | undefined;
    expect(queued).toBeDefined();

    const record = JSON.parse(queued!.payload).record as Record<string, unknown>;
    expect(record).toHaveProperty('nemisId', '482915736045');
    expect(record).not.toHaveProperty('admissionNumber');
    db.close();
  });
});
