import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrations } from './registry';

function migrated() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = OFF');
  for (const migration of migrations) migration.up(db);
  return db;
}

function insertTransfer(db: Database.Database, id: string) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO student_transfers
       (id, studentId, fromInstitutionId, toInstitutionId, requestedBy, reason, status, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(id, 'student-1', 'school-1', 'school-2', 'user-1', 'Relocation', 'PENDING', now, now);
}

describe('025-make-student-transfers-pull-only', () => {
  it('adds the columns the C3 inbox needs', () => {
    const db = migrated();
    const columns = (db.prepare(`PRAGMA table_info("student_transfers")`).all() as { name: string }[])
      .map((column) => column.name);
    expect(columns).toEqual(expect.arrayContaining(['initiatedBy', 'lapsesAt', 'classId', 'termId']));
    db.close();
  });

  it('defaults initiatedBy to ORIGIN_SCHOOL, matching the server default', () => {
    const db = migrated();
    insertTransfer(db, 't1');
    expect(db.prepare(`SELECT initiatedBy, lapsesAt FROM student_transfers WHERE id='t1'`).get())
      .toEqual({ initiatedBy: 'ORIGIN_SCHOOL', lapsesAt: null });
    db.close();
  });

  it('never queues a transfer write for push', () => {
    const db = migrated();
    db.prepare(`UPDATE sync_runtime SET captureEnabled = 1 WHERE id = 'singleton'`).run();
    insertTransfer(db, 't1');
    db.prepare(`UPDATE student_transfers SET status='APPROVED' WHERE id='t1'`).run();
    db.prepare(`DELETE FROM student_transfers WHERE id='t1'`).run();
    expect(
      db.prepare(`SELECT count(*) c FROM sync_queue WHERE entityType = 'student_transfers'`).get(),
    ).toEqual({ c: 0 });
    db.close();
  });
});
