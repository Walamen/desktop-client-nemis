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

describe('028-add-transfer-display-fields', () => {
  it('adds the four display columns and installs no outbox triggers', () => {
    const db = migrated();
    const columns = (db.prepare(`PRAGMA table_info("student_transfers")`).all() as { name: string }[]).map((c) => c.name);
    expect(columns).toEqual(expect.arrayContaining(['studentName', 'studentNemisId', 'fromInstitutionName', 'toInstitutionName']));
    expect(db.prepare(`SELECT count(*) c FROM sqlite_master WHERE type='trigger' AND name LIKE 'outbox_student_transfers%'`).get()).toEqual({ c: 0 });
    db.close();
  });
});
