import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';
import { installOutboxTriggers } from './010-create-sync-outbox';

/**
 * The outbox ordered pushes by createdAt (millisecond) then a RANDOM id, so
 * rows written in one transaction — a student, its guardian link and its
 * enrolment — could be pushed in any order and the server would reject the
 * enrolment for a student it had not seen yet. `seq` is a monotonic insert
 * counter: MAX(seq)+1 inside the trigger is safe because SQLite serialises
 * writers. Existing rows are numbered in their (createdAt, rowid) order, which
 * is the best order information they carry. Every outbox trigger is
 * regenerated so all tables stamp it (NEMIS ID desktop parity, Stage 3 plan,
 * Task 1).
 */
export const addSyncQueueSequence: Migration = {
  version: 26,
  name: 'add-sync-queue-sequence',
  up(db: SqliteDatabase): void {
    db.exec(`ALTER TABLE sync_queue ADD COLUMN seq INTEGER;`);
    const rows = db.prepare(`SELECT rowid AS r FROM sync_queue ORDER BY createdAt, rowid`).all() as { r: number }[];
    const stamp = db.prepare(`UPDATE sync_queue SET seq = ? WHERE rowid = ?`);
    rows.forEach((row, index) => stamp.run(index + 1, row.r));
    db.exec(`CREATE INDEX idx_sync_queue_seq ON sync_queue (seq);`);

    // Only tables that still have outbox triggers are found, so tables whose
    // triggers an earlier migration dropped (e.g. student_transfers, 025) stay
    // trigger-free. Prefix is checked in JS to avoid LIKE-escape ambiguity.
    const tables = (db.prepare(
      `SELECT DISTINCT tbl_name AS t, name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'outbox_%'`,
    ).all() as { t: string; name: string }[])
      .filter((row) => row.name.startsWith('outbox_') && /^outbox_.+_(insert|update|delete)$/.test(row.name))
      .map((row) => row.t);
    const unique = [...new Set(tables)];
    for (const table of unique) {
      db.exec(`
        DROP TRIGGER IF EXISTS outbox_${table}_insert;
        DROP TRIGGER IF EXISTS outbox_${table}_update;
        DROP TRIGGER IF EXISTS outbox_${table}_delete;
      `);
    }
    installOutboxTriggers(db, unique);
  },
};
