import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';
import {
  capturedOutboxColumns,
  installMergingOutboxTriggers,
} from '../outbox/mergingOutboxTriggers';

/**
 * 046 merged a new local edit into any pending, not dead-lettered, not
 * backed-off update. A row that was already sent can be in exactly that state
 * again (the unreachable-server path, in_flight recovery, a released backoff,
 * a dead-letter retry), and a merge keeps its id — the server's operationId.
 * If the server had applied the first send, the re-push gets the old receipt
 * back and the merged edit is silently dropped.
 *
 * `sync_queue.sentAt` records the first time a row was claimed (set by
 * SqliteSyncQueueRepository when a row goes in_flight), and every outbox
 * table's triggers are regenerated so a merge target, and the delete
 * trigger's newest-unsent guard, also require `sentAt IS NULL`. An edit after
 * a sent row becomes its own row, which the push rounds rebase onto the
 * server's token once the sent row is acknowledged.
 *
 * Every row already in the queue is stamped (with its updatedAt): whether it
 * was ever sent cannot be told after the fact, and the safe answer is "yes" —
 * the cost is one extra queued row for that record, never a lost edit.
 *
 * Triggers are rebuilt the same way as 046: only tables that still have an
 * outbox insert trigger, each from the columns that trigger captures (never
 * the live table columns).
 */
export const neverMergeIntoSentRows: Migration = {
  version: 47,
  name: 'never-merge-into-sent-rows',
  up(db: SqliteDatabase): void {
    db.exec(`
      ALTER TABLE sync_queue ADD COLUMN sentAt TEXT;
      UPDATE sync_queue SET sentAt = updatedAt;
    `);

    const tables = (db
      .prepare(`SELECT tbl_name AS t, name FROM sqlite_master WHERE type = 'trigger' ORDER BY tbl_name`)
      .all() as { t: string; name: string }[])
      .filter((row) => row.name === `outbox_${row.t}_insert`)
      .map((row) => row.t);

    for (const table of tables) {
      const columns = capturedOutboxColumns(db, table);
      db.exec(`
        DROP TRIGGER IF EXISTS outbox_${table}_insert;
        DROP TRIGGER IF EXISTS outbox_${table}_update;
        DROP TRIGGER IF EXISTS outbox_${table}_update_merge;
        DROP TRIGGER IF EXISTS outbox_${table}_delete;
        DROP TRIGGER IF EXISTS outbox_${table}_delete_merge;
      `);
      installMergingOutboxTriggers(db, table, columns);
    }
  },
};
