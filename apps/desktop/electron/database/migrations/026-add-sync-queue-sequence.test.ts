import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrations } from './registry';

function migrated() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = OFF');
  for (const migration of migrations) migration.up(db);
  db.prepare(`UPDATE sync_runtime SET captureEnabled = 1 WHERE id = 'singleton'`).run();
  return db;
}

function insertStudent(db: Database.Database, id: string) {
  db.prepare(
    `INSERT INTO students (id, institutionId, firstName, lastName, nemisId, dateOfBirth, gender, isActive, version, updatedAt)
     VALUES (?,?,?,?,?,?,?,1,1,?)`,
  ).run(id, 'school-1', 'Musu', 'Kollie', null, '2012-04-01', 'FEMALE', '2026-01-01T00:00:00.000Z');
}

describe('026-add-sync-queue-sequence', () => {
  it('stamps a strictly increasing seq in write order, even inside one transaction', () => {
    const db = migrated();
    db.transaction(() => {
      for (let i = 0; i < 25; i++) insertStudent(db, `s${i}`);
    })();
    const rows = db.prepare(`SELECT entityId, seq FROM sync_queue ORDER BY seq`).all() as { entityId: string; seq: number }[];
    expect(rows.map((r) => r.entityId)).toEqual(Array.from({ length: 25 }, (_, i) => `s${i}`));
    expect(new Set(rows.map((r) => r.seq)).size).toBe(25);
    db.close();
  });

  it('stamps seq for every table that has outbox triggers', () => {
    const db = migrated();
    const tables = (db.prepare(
      `SELECT DISTINCT tbl_name AS t FROM sqlite_master WHERE type='trigger' AND name LIKE 'outbox_%'`,
    ).all() as { t: string }[]).map((r) => r.t);
    expect(tables.length).toBeGreaterThan(10);
    expect(tables).not.toContain('student_transfers');
    for (const table of tables) {
      const sql = (db.prepare(`SELECT sql FROM sqlite_master WHERE type='trigger' AND name = ?`)
        .get(`outbox_${table}_insert`) as { sql: string } | undefined)?.sql ?? '';
      expect(sql, table).toContain('seq');
    }
    db.close();
  });

  it('backfills existing rows in their original (createdAt, rowid) order', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = OFF');
    const before = migrations.filter((m) => m.version < 26);
    for (const m of before) m.up(db);
    db.prepare(`UPDATE sync_runtime SET captureEnabled = 1 WHERE id = 'singleton'`).run();
    insertStudent(db, 'a');
    insertStudent(db, 'b');
    for (const m of migrations.filter((m) => m.version >= 26)) m.up(db);
    const rows = db.prepare(`SELECT entityId FROM sync_queue ORDER BY seq`).all() as { entityId: string }[];
    expect(rows.map((r) => r.entityId)).toEqual(['a', 'b']);
    db.close();
  });
});
