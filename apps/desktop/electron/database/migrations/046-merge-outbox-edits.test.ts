import Database from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { capturedOutboxColumns } from '../outbox/mergingOutboxTriggers';
import { migrations } from './registry';

type Col = { name: string; type: string; notnull: number; dflt_value: string | null };
type QueueRow = {
  id: string;
  entityId: string;
  operationType: string;
  payload: string;
  status: string;
  seq: number;
  deadLetter: number;
  nextAttemptAt: string | null;
};

function migratedThrough(version: number): SqliteDatabase {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = OFF');
  for (const m of migrations.filter((x) => x.version <= version)) m.up(db);
  return db;
}

function outboxTables(db: SqliteDatabase): string[] {
  return (db
    .prepare(`SELECT tbl_name AS t, name FROM sqlite_master WHERE type = 'trigger' ORDER BY tbl_name`)
    .all() as { t: string; name: string }[])
    .filter((row) => row.name === `outbox_${row.t}_insert`)
    .map((row) => row.t);
}

/** Inserts a row, filling any other NOT NULL column that has no default. */
function insert(db: SqliteDatabase, table: string, values: Record<string, unknown>): void {
  const cols = db.pragma(`table_info("${table}")`) as Col[];
  const row: Record<string, unknown> = { ...values };
  for (const c of cols) {
    if (c.name in row || c.notnull === 0 || c.dflt_value !== null) continue;
    row[c.name] = /INT|REAL|NUM/i.test(c.type) ? 1 : 'x';
  }
  const names = Object.keys(row);
  db.prepare(
    `INSERT INTO "${table}" (${names.map((n) => `"${n}"`).join(',')}) VALUES (${names.map(() => '?').join(',')})`,
  ).run(...Object.values(row));
}

function setCapture(db: SqliteDatabase, enabled: boolean): void {
  db.prepare(`UPDATE sync_runtime SET captureEnabled = ? WHERE id = 'singleton'`).run(enabled ? 1 : 0);
}

/** A synced student: present locally, nothing queued. */
function seedStudent(db: SqliteDatabase, id: string, firstName = 'Ada'): void {
  setCapture(db, false);
  insert(db, 'students', { id, firstName, lastName: 'Kollie', updatedAt: 'server-token-1' });
  setCapture(db, true);
}

function rename(db: SqliteDatabase, id: string, firstName: string, updatedAt: string): void {
  db.prepare(`UPDATE students SET firstName = ?, updatedAt = ? WHERE id = ?`).run(firstName, updatedAt, id);
}

function queue(db: SqliteDatabase): QueueRow[] {
  return db
    .prepare(
      `SELECT id, entityId, operationType, payload, status, seq, deadLetter, nextAttemptAt
         FROM sync_queue ORDER BY seq`,
    )
    .all() as QueueRow[];
}

function payloadOf(row: QueueRow): { base?: Record<string, unknown>; record?: Record<string, unknown> } {
  return JSON.parse(row.payload) as { base?: Record<string, unknown>; record?: Record<string, unknown> };
}

/** Recreates a table's outbox triggers in the reverse of their current creation
 * order, so SQLite fires each pair the other way round. */
function reverseTriggerOrder(db: SqliteDatabase, table: string): void {
  const triggers = db
    .prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ? ORDER BY rowid`)
    .all(table) as { name: string; sql: string }[];
  const outbox = triggers.filter((t) => t.name.startsWith(`outbox_${table}_`));
  for (const t of outbox) db.exec(`DROP TRIGGER "${t.name}"`);
  for (const t of [...outbox].reverse()) db.exec(t.sql);
}

const BOTH_ORDERS = [
  ['as installed', () => undefined],
  ['with trigger order reversed', (db: SqliteDatabase) => reverseTriggerOrder(db, 'students')],
] as const;

describe('migration 046 merge-outbox-edits', () => {
  it("keeps every table's captured column list identical", () => {
    const db = migratedThrough(45);
    const before = Object.fromEntries(outboxTables(db).map((t) => [t, capturedOutboxColumns(db, t)]));
    expect(Object.keys(before).length).toBeGreaterThan(20);

    const m46 = migrations.find((m) => m.version === 46);
    expect(m46?.name).toBe('merge-outbox-edits');
    m46!.up(db);

    const after = Object.fromEntries(outboxTables(db).map((t) => [t, capturedOutboxColumns(db, t)]));
    expect(after).toEqual(before);
    for (const table of Object.keys(after)) {
      for (const suffix of ['insert', 'update', 'update_merge', 'delete', 'delete_merge']) {
        expect(
          db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'trigger' AND name = ?`).get(`outbox_${table}_${suffix}`),
        ).toBeDefined();
      }
    }
    expect(after.students).not.toContain('createdAt');
    expect(after.students).not.toContain('nationalId');
    expect(after.students).not.toContain('photoUrl');
    expect(after.students).toContain('nemisId');
    expect(after.grades).not.toContain('enteredAtClose');
    expect(after.grades).toContain('marksObtained');
  });

  it('every update and delete payload carries exactly the captured columns', () => {
    const db = migratedThrough(46);
    const columns = capturedOutboxColumns(db, 'students');
    seedStudent(db, 's-1');
    rename(db, 's-1', 'Bea', 't2');
    const [update] = queue(db);
    expect(Object.keys(payloadOf(update!).base!)).toEqual(columns);
    expect(Object.keys(payloadOf(update!).record!)).toEqual(columns);
  });

  for (const [order, arrange] of BOTH_ORDERS) {
    describe(order, () => {
      it('update then update makes one row: original base, latest record, new seq', () => {
        const db = migratedThrough(46);
        arrange(db);
        seedStudent(db, 's-1');
        rename(db, 's-1', 'Bea', 'desktop-clock-2');
        const [first] = queue(db);
        rename(db, 's-1', 'Cee', 'desktop-clock-3');

        const rows = queue(db);
        expect(rows).toHaveLength(1);
        const [merged] = rows;
        expect(merged!.id).toBe(first!.id);
        expect(merged!.operationType).toBe('update');
        expect(merged!.status).toBe('pending');
        expect(merged!.seq).toBeGreaterThan(first!.seq);
        const payload = payloadOf(merged!);
        expect(payload.base).toMatchObject({ firstName: 'Ada', updatedAt: 'server-token-1' });
        expect(payload.record).toMatchObject({ firstName: 'Cee', updatedAt: 'desktop-clock-3' });
        // Stored as a JSON object, not a JSON string.
        expect(db.prepare(`SELECT json_type(payload, '$.record') AS t FROM sync_queue`).get()).toEqual({ t: 'object' });
      });

      it('a third update still merges into the same row', () => {
        const db = migratedThrough(46);
        arrange(db);
        seedStudent(db, 's-1');
        rename(db, 's-1', 'Bea', 't2');
        rename(db, 's-1', 'Cee', 't3');
        rename(db, 's-1', 'Dee', 't4');
        const rows = queue(db);
        expect(rows).toHaveLength(1);
        expect(payloadOf(rows[0]!).base).toMatchObject({ firstName: 'Ada', updatedAt: 'server-token-1' });
        expect(payloadOf(rows[0]!).record).toMatchObject({ firstName: 'Dee', updatedAt: 't4' });
      });

      it('rewriting the values already queued leaves the queued row as it is', () => {
        const db = migratedThrough(46);
        arrange(db);
        seedStudent(db, 's-1');
        rename(db, 's-1', 'Bea', 't2');
        const before = queue(db);
        rename(db, 's-1', 'Bea', 't2');
        expect(queue(db)).toEqual(before);
      });

      it('update then delete makes one delete row with the original base and no record', () => {
        const db = migratedThrough(46);
        arrange(db);
        seedStudent(db, 's-1');
        rename(db, 's-1', 'Bea', 'desktop-clock-2');
        const [first] = queue(db);
        db.prepare(`DELETE FROM students WHERE id = 's-1'`).run();

        const rows = queue(db);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.id).toBe(first!.id);
        expect(rows[0]!.operationType).toBe('delete');
        expect(rows[0]!.seq).toBeGreaterThan(first!.seq);
        const payload = payloadOf(rows[0]!);
        expect(payload.base).toMatchObject({ firstName: 'Ada', updatedAt: 'server-token-1' });
        expect(payload).not.toHaveProperty('record');
      });

      it('a first update and a first delete each enqueue exactly one row', () => {
        const db = migratedThrough(46);
        arrange(db);
        seedStudent(db, 's-1');
        seedStudent(db, 's-2');
        rename(db, 's-1', 'Bea', 't2');
        db.prepare(`DELETE FROM students WHERE id = 's-2'`).run();
        const rows = queue(db);
        expect(rows.map((r) => [r.entityId, r.operationType])).toEqual([
          ['s-1', 'update'],
          ['s-2', 'delete'],
        ]);
        expect(payloadOf(rows[0]!).base).toMatchObject({ firstName: 'Ada' });
        expect(payloadOf(rows[0]!).record).toMatchObject({ firstName: 'Bea' });
        expect(payloadOf(rows[1]!)).toEqual({ base: expect.objectContaining({ firstName: 'Ada' }) });
        // Only the inserting trigger of each pair fired: had the merge trigger
        // also fired on the row just inserted, it would have taken a second seq.
        expect(rows.map((r) => r.seq)).toEqual([1, 2]);
      });

      it('create then update is not merged', () => {
        const db = migratedThrough(46);
        arrange(db);
        insert(db, 'students', { id: 's-1', firstName: 'Ada', lastName: 'Kollie', updatedAt: 't1' });
        rename(db, 's-1', 'Bea', 't2');
        const rows = queue(db);
        expect(rows.map((r) => r.operationType)).toEqual(['create', 'update']);
        expect(payloadOf(rows[0]!).record).toMatchObject({ firstName: 'Ada' });
      });

      it('create, update, update merges only the two updates', () => {
        const db = migratedThrough(46);
        arrange(db);
        insert(db, 'students', { id: 's-1', firstName: 'Ada', lastName: 'Kollie', updatedAt: 't1' });
        rename(db, 's-1', 'Bea', 't2');
        rename(db, 's-1', 'Cee', 't3');
        const rows = queue(db);
        expect(rows.map((r) => r.operationType)).toEqual(['create', 'update']);
        expect(payloadOf(rows[1]!).base).toMatchObject({ firstName: 'Ada' });
        expect(payloadOf(rows[1]!).record).toMatchObject({ firstName: 'Cee' });
      });

      it('an update after an in_flight row creates a new row', () => {
        const db = migratedThrough(46);
        arrange(db);
        seedStudent(db, 's-1');
        rename(db, 's-1', 'Bea', 't2');
        db.prepare(`UPDATE sync_queue SET status = 'in_flight'`).run();
        rename(db, 's-1', 'Cee', 't3');
        const rows = queue(db);
        expect(rows.map((r) => [r.status, r.operationType])).toEqual([
          ['in_flight', 'update'],
          ['pending', 'update'],
        ]);
        expect(payloadOf(rows[0]!).record).toMatchObject({ firstName: 'Bea' });
        expect(payloadOf(rows[1]!).base).toMatchObject({ firstName: 'Bea' });
      });

      it('a delete after an in_flight row creates a new row', () => {
        const db = migratedThrough(46);
        arrange(db);
        seedStudent(db, 's-1');
        rename(db, 's-1', 'Bea', 't2');
        db.prepare(`UPDATE sync_queue SET status = 'in_flight'`).run();
        db.prepare(`DELETE FROM students WHERE id = 's-1'`).run();
        expect(queue(db).map((r) => [r.status, r.operationType])).toEqual([
          ['in_flight', 'update'],
          ['pending', 'delete'],
        ]);
      });

      it('an update after a backed-off row creates a new row', () => {
        const db = migratedThrough(46);
        arrange(db);
        seedStudent(db, 's-1');
        rename(db, 's-1', 'Bea', 't2');
        db.prepare(`UPDATE sync_queue SET nextAttemptAt = '2099-01-01T00:00:00.000Z', retryCount = 1`).run();
        const [held] = queue(db);
        rename(db, 's-1', 'Cee', 't3');
        const rows = queue(db);
        expect(rows).toHaveLength(2);
        expect(rows[0]).toEqual(held);
        expect(rows[1]!.nextAttemptAt).toBeNull();
        expect(payloadOf(rows[1]!).record).toMatchObject({ firstName: 'Cee' });
      });

      it('an update after a dead-lettered row creates a new row', () => {
        const db = migratedThrough(46);
        arrange(db);
        seedStudent(db, 's-1');
        rename(db, 's-1', 'Bea', 't2');
        db.prepare(`UPDATE sync_queue SET deadLetter = 1`).run();
        const [dead] = queue(db);
        rename(db, 's-1', 'Cee', 't3');
        const rows = queue(db);
        expect(rows).toHaveLength(2);
        expect(rows[0]).toEqual(dead);
        expect(rows[1]!.deadLetter).toBe(0);
      });

      it('an update after a failed or completed row creates a new row', () => {
        const db = migratedThrough(46);
        arrange(db);
        seedStudent(db, 's-1');
        seedStudent(db, 's-2');
        rename(db, 's-1', 'Bea', 't2');
        rename(db, 's-2', 'Bea', 't2');
        db.prepare(`UPDATE sync_queue SET status = 'failed' WHERE entityId = 's-1'`).run();
        db.prepare(`UPDATE sync_queue SET status = 'completed' WHERE entityId = 's-2'`).run();
        rename(db, 's-1', 'Cee', 't3');
        rename(db, 's-2', 'Cee', 't3');
        expect(queue(db).map((r) => [r.entityId, r.status])).toEqual([
          ['s-1', 'failed'],
          ['s-2', 'completed'],
          ['s-1', 'pending'],
          ['s-2', 'pending'],
        ]);
      });

      it('merging moves the row after rows written in between', () => {
        const db = migratedThrough(46);
        arrange(db);
        seedStudent(db, 's-1');
        seedStudent(db, 's-2');
        rename(db, 's-1', 'Bea', 't2');
        rename(db, 's-2', 'Bee', 't2');
        const between = queue(db).find((r) => r.entityId === 's-2')!;
        rename(db, 's-1', 'Cee', 't3');
        const rows = queue(db);
        expect(rows.map((r) => r.entityId)).toEqual(['s-2', 's-1']);
        expect(rows[1]!.seq).toBeGreaterThan(between.seq);
      });

      it('does not merge into another record’s queued update', () => {
        const db = migratedThrough(46);
        arrange(db);
        seedStudent(db, 's-1');
        seedStudent(db, 's-2');
        rename(db, 's-1', 'Bea', 't2');
        rename(db, 's-2', 'Bee', 't2');
        const rows = queue(db);
        expect(rows).toHaveLength(2);
        expect(payloadOf(rows[0]!).record).toMatchObject({ id: 's-1', firstName: 'Bea' });
        expect(payloadOf(rows[1]!).record).toMatchObject({ id: 's-2', firstName: 'Bee' });
      });

      it('writes with capture disabled neither enqueue nor merge', () => {
        const db = migratedThrough(46);
        arrange(db);
        seedStudent(db, 's-1');
        seedStudent(db, 's-2');
        rename(db, 's-1', 'Bea', 't2');
        const before = queue(db);

        setCapture(db, false);
        rename(db, 's-1', 'Cee', 't3');
        rename(db, 's-2', 'Cee', 't3');
        db.prepare(`DELETE FROM students WHERE id = 's-1'`).run();
        insert(db, 'students', { id: 's-3', firstName: 'Ada', lastName: 'Kollie', updatedAt: 't1' });
        setCapture(db, true);

        expect(queue(db)).toEqual(before);
      });
    });
  }

  it('leaves existing queue rows untouched', () => {
    const db = migratedThrough(45);
    seedStudent(db, 's-1');
    rename(db, 's-1', 'Bea', 't2');
    const before = db.prepare(`SELECT * FROM sync_queue`).all();
    migrations.find((m) => m.version === 46)!.up(db);
    expect(db.prepare(`SELECT * FROM sync_queue`).all()).toEqual(before);

    // A pre-existing pending update is a valid merge target after migrating.
    rename(db, 's-1', 'Cee', 't3');
    const rows = queue(db);
    expect(rows).toHaveLength(1);
    expect(payloadOf(rows[0]!).base).toMatchObject({ firstName: 'Ada' });
    expect(payloadOf(rows[0]!).record).toMatchObject({ firstName: 'Cee' });
  });
});
