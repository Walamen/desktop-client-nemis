import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrations } from './registry';

type ColumnInfo = { name: string };
type TriggerRow = { name: string; sql: string };

const guardianTriggers = (db: Database.Database) =>
  db
    .prepare(`SELECT name, sql FROM sqlite_master WHERE type='trigger' AND tbl_name='guardians' ORDER BY name`)
    .all() as TriggerRow[];

describe('migration 036 add-guardian-photo', () => {
  it('adds guardians.photoUrl, forces a full resync, and leaves the outbox triggers (and payloads) without it', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    for (const migration of migrations.filter((m) => m.version <= 35)) migration.up(db);
    db.prepare(
      `INSERT INTO sync_metadata (id, schemaVersion, databaseVersion, lastFullResyncAt, createdAt, updatedAt)
       VALUES ('singleton', 35, 35, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')`,
    ).run();
    const before = guardianTriggers(db);
    expect(before).toHaveLength(3);

    migrations.find((m) => m.version === 36)!.up(db);

    expect((db.pragma('table_info(guardians)') as ColumnInfo[]).map((c) => c.name)).toContain('photoUrl');
    expect(db.prepare(`SELECT lastFullResyncAt FROM sync_metadata`).get()).toEqual({ lastFullResyncAt: null });
    expect(guardianTriggers(db)).toEqual(before);

    db.prepare(
      `INSERT INTO guardians (id,firstName,lastName,relationship,phoneNumber,isEmergencyContact,version,updatedAt,photoUrl)
       VALUES ('g-1','Mary','Kollie','Mother','0770',0,1,'2026-10-01T00:00:00.000Z','https://x/g.jpg')`,
    ).run();
    db.prepare(`UPDATE guardians SET firstName = 'Marie' WHERE id = 'g-1'`).run();
    const { payload } = db
      .prepare(`SELECT payload FROM sync_queue WHERE entityType = 'guardians' AND operationType = 'update'`)
      .get() as { payload: string };
    const parsed = JSON.parse(payload) as { record: Record<string, unknown> };
    expect(parsed.record.firstName).toBe('Marie');
    expect(parsed.record.photoUrl).toBeUndefined();
  });

  it("indexes student_guardians by guardianId so the County list's per-guardian subqueries don't scan every link", () => {
    const db = new Database(':memory:');
    for (const migration of migrations.filter((m) => m.version <= 36)) migration.up(db);

    const plan = db
      .prepare(`EXPLAIN QUERY PLAN SELECT 1 FROM student_guardians sg WHERE sg.guardianId = ?`)
      .all('g-1') as Array<{ detail: string }>;
    expect(plan.map((row) => row.detail).join(' ')).toContain('idx_student_guardians_guardian');
  });
});
