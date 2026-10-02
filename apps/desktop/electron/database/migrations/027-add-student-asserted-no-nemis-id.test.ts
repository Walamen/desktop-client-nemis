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

describe('027-add-student-asserted-no-nemis-id', () => {
  it('adds assertedNoNemisId defaulting to 0 and carries it in the outbox payload', () => {
    const db = migrated();
    db.prepare(
      `INSERT INTO students (id, institutionId, firstName, lastName, nemisId, dateOfBirth, gender, isActive, version, updatedAt, assertedNoNemisId)
       VALUES ('s1','school-1','Musu','Kollie','482915736045','2012-04-01','FEMALE',1,1,'2026-01-01T00:00:00.000Z',1)`,
    ).run();
    const payload = JSON.parse((db.prepare(`SELECT payload FROM sync_queue WHERE entityId='s1'`).get() as { payload: string }).payload);
    expect(payload.record.assertedNoNemisId).toBe(1);
    db.prepare(
      `INSERT INTO students (id, institutionId, firstName, lastName, nemisId, dateOfBirth, gender, isActive, version, updatedAt)
       VALUES ('s2','school-1','Joe','Wleh',NULL,'2012-04-01','MALE',1,1,'2026-01-01T00:00:00.000Z')`,
    ).run();
    expect(db.prepare(`SELECT assertedNoNemisId FROM students WHERE id='s2'`).get()).toEqual({ assertedNoNemisId: 0 });
    db.close();
  });
});
