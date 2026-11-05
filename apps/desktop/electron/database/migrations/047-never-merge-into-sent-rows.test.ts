import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { capturedOutboxColumns } from '../outbox/mergingOutboxTriggers';
import { migrations } from './registry';

type QueueRow = {
  id: string;
  entityId: string;
  operationType: string;
  payload: string;
  status: string;
  seq: number;
  sentAt: string | null;
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

function setCapture(db: SqliteDatabase, enabled: boolean): void {
  db.prepare(`UPDATE sync_runtime SET captureEnabled = ? WHERE id = 'singleton'`).run(enabled ? 1 : 0);
}

/** A synced student: present locally, nothing queued. Any other NOT NULL
 * column without a default gets a placeholder. */
function seedStudent(db: SqliteDatabase, id: string): void {
  const row: Record<string, unknown> = { id, firstName: 'Ada', lastName: 'Kollie', updatedAt: 'server-token-1' };
  const cols = db.pragma(`table_info(students)`) as { name: string; type: string; notnull: number; dflt_value: string | null }[];
  for (const c of cols) {
    if (c.name in row || c.notnull === 0 || c.dflt_value !== null) continue;
    row[c.name] = /INT|REAL|NUM/i.test(c.type) ? 1 : 'x';
  }
  const names = Object.keys(row);
  setCapture(db, false);
  db.prepare(
    `INSERT INTO students (${names.map((n) => `"${n}"`).join(',')}) VALUES (${names.map(() => '?').join(',')})`,
  ).run(...Object.values(row));
  setCapture(db, true);
}

function rename(db: SqliteDatabase, id: string, firstName: string, updatedAt: string): void {
  db.prepare(`UPDATE students SET firstName = ?, updatedAt = ? WHERE id = ?`).run(firstName, updatedAt, id);
}

function queue(db: SqliteDatabase): QueueRow[] {
  return db
    .prepare(`SELECT id, entityId, operationType, payload, status, seq, sentAt FROM sync_queue ORDER BY seq`)
    .all() as QueueRow[];
}

function payloadOf(row: QueueRow): { base?: Record<string, unknown>; record?: Record<string, unknown> } {
  return JSON.parse(row.payload) as { base?: Record<string, unknown>; record?: Record<string, unknown> };
}

/** A row that went out once and came back to pending with no backoff (the
 * unreachable-server path, in_flight recovery, a released backoff, a
 * dead-letter retry): pending, not dead-lettered, not backed off — but sent. */
function markSentAndReturned(db: SqliteDatabase): void {
  db.prepare(`UPDATE sync_queue SET sentAt = '2026-11-05T00:00:00.000Z'`).run();
}

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

describe('migration 047 never-merge-into-sent-rows', () => {
  it('adds a nullable sync_queue.sentAt and keeps every table’s captured columns and triggers', () => {
    const db = migratedThrough(46);
    const before = Object.fromEntries(outboxTables(db).map((t) => [t, capturedOutboxColumns(db, t)]));
    expect(Object.keys(before).length).toBeGreaterThan(20);

    const m47 = migrations.find((m) => m.version === 47);
    expect(m47?.name).toBe('never-merge-into-sent-rows');
    m47!.up(db);

    const column = (db.pragma(`table_info(sync_queue)`) as { name: string; type: string; notnull: number }[]).find(
      (c) => c.name === 'sentAt',
    );
    expect(column).toMatchObject({ type: 'TEXT', notnull: 0 });
    const after = Object.fromEntries(outboxTables(db).map((t) => [t, capturedOutboxColumns(db, t)]));
    expect(after).toEqual(before);
    for (const table of Object.keys(after)) {
      for (const suffix of ['update_merge', 'delete', 'delete_merge']) {
        const sql = (db
          .prepare(`SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ?`)
          .get(`outbox_${table}_${suffix}`) as { sql: string } | undefined)?.sql;
        expect(sql).toContain('sentAt IS NULL');
      }
    }
  });

  it('treats every queue row from before the migration as possibly sent', () => {
    const db = migratedThrough(46);
    seedStudent(db, 's-1');
    rename(db, 's-1', 'Bea', 't2');
    const old = db.prepare(`SELECT id FROM sync_queue`).get() as { id: string };
    migrations.find((m) => m.version === 47)!.up(db);

    rename(db, 's-1', 'Cee', 't3');
    const rows = queue(db);
    expect(rows.map((r) => r.id)).toEqual([old.id, expect.any(String)]);
    expect(rows[0]!.sentAt).not.toBeNull();
    expect(payloadOf(rows[0]!).record).toMatchObject({ firstName: 'Bea' });
    expect(rows[1]!.sentAt).toBeNull();
    expect(payloadOf(rows[1]!).record).toMatchObject({ firstName: 'Cee' });
  });

  for (const [order, arrange] of BOTH_ORDERS) {
    describe(order, () => {
      it('an update after a pending update that was already sent queues a new row', () => {
        const db = migratedThrough(47);
        arrange(db);
        seedStudent(db, 's-1');
        rename(db, 's-1', 'Bea', 't2');
        markSentAndReturned(db);
        const [sent] = queue(db);
        rename(db, 's-1', 'Cee', 't3');

        const rows = queue(db);
        expect(rows).toHaveLength(2);
        expect(rows[0]).toEqual(sent);
        expect(rows[1]).toMatchObject({ operationType: 'update', status: 'pending', sentAt: null });
        expect(payloadOf(rows[1]!).base).toMatchObject({ firstName: 'Bea', updatedAt: 't2' });
        expect(payloadOf(rows[1]!).record).toMatchObject({ firstName: 'Cee', updatedAt: 't3' });
      });

      it('a later update merges into the new unsent row, not the sent one', () => {
        const db = migratedThrough(47);
        arrange(db);
        seedStudent(db, 's-1');
        rename(db, 's-1', 'Bea', 't2');
        markSentAndReturned(db);
        const [sent] = queue(db);
        rename(db, 's-1', 'Cee', 't3');
        rename(db, 's-1', 'Dee', 't4');

        const rows = queue(db);
        expect(rows).toHaveLength(2);
        expect(rows[0]).toEqual(sent);
        expect(payloadOf(rows[1]!).base).toMatchObject({ firstName: 'Bea' });
        expect(payloadOf(rows[1]!).record).toMatchObject({ firstName: 'Dee' });
      });

      it('a delete after a pending update that was already sent queues a new delete row', () => {
        const db = migratedThrough(47);
        arrange(db);
        seedStudent(db, 's-1');
        rename(db, 's-1', 'Bea', 't2');
        markSentAndReturned(db);
        const [sent] = queue(db);
        db.prepare(`DELETE FROM students WHERE id = 's-1'`).run();

        const rows = queue(db);
        expect(rows).toHaveLength(2);
        expect(rows[0]).toEqual(sent);
        expect(rows[1]).toMatchObject({ operationType: 'delete', status: 'pending', sentAt: null });
        expect(payloadOf(rows[1]!).base).toMatchObject({ firstName: 'Bea' });
      });

      it('an unsent pending update is still merged into', () => {
        const db = migratedThrough(47);
        arrange(db);
        seedStudent(db, 's-1');
        rename(db, 's-1', 'Bea', 't2');
        const [first] = queue(db);
        rename(db, 's-1', 'Cee', 't3');
        db.prepare(`DELETE FROM students WHERE id = 's-1'`).run();

        const rows = queue(db);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ id: first!.id, operationType: 'delete', sentAt: null });
        expect(payloadOf(rows[0]!).base).toMatchObject({ firstName: 'Ada', updatedAt: 'server-token-1' });
      });
    });
  }
});
