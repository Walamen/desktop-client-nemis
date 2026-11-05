import type { Database as SqliteDatabase } from 'better-sqlite3';

/**
 * Outbox triggers that fold a second local edit into a queued update that has
 * not been sent yet (docs/superpowers/specs/2026-11-05-sync-queue-consecutive-edits-design.md,
 * section 5.4).
 *
 * A record's "mergeable target" is its newest queue row among those that are
 * pending or in flight, when that row is a pending update that is not
 * dead-lettered and not backed off. An update or delete of a record with a
 * mergeable target rewrites that row (keeping its original `base`, the token
 * the server issued) and moves it to the end of the queue; otherwise a new row
 * is inserted exactly as the migration-010 triggers did. Creates are never
 * merged into.
 *
 * Each update and delete is handled by a pair of AFTER triggers, and SQLite
 * does not promise which of a pair fires first. Each trigger's WHEN is
 * evaluated only when that trigger fires, so after the other one has run. The
 * WHEN clauses are therefore written so that whichever runs first leaves the
 * other's WHEN false:
 *
 * - update: the merge fires only when the target's `record` is not already the
 *   new row. A row the insert trigger has just written carries the new row, so
 *   the merge skips it; after a merge the target is still mergeable, so the
 *   insert skips. Writing a row with exactly the values already queued is
 *   therefore a no-op (the queued row keeps its place; its content is right).
 * - delete: the insert fires only when the newest pending/in-flight row is not
 *   an unsent pending update or delete. A merge turns the target into such a
 *   delete, so the insert skips; a fresh delete row is not an update, so the
 *   merge skips. A record whose delete is already queued and unsent is
 *   therefore not queued for deletion a second time.
 */

/** The columns the table's current `outbox_<table>_insert` trigger puts into
 * the payload, in payload order. Each table keeps exactly this list when its
 * triggers are regenerated — never the live table columns, which include
 * columns that are deliberately not pushed (students.createdAt, see 031). */
export function capturedOutboxColumns(db: SqliteDatabase, table: string): string[] {
  const row = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ?`)
    .get(`outbox_${table}_insert`) as { sql: string } | undefined;
  if (!row) throw new Error(`No outbox insert trigger for table ${table}`);
  const columns: string[] = [];
  for (const match of row.sql.matchAll(/'([^']+)',NEW\."([^"]+)"/g)) {
    const [, key, column] = match;
    if (!column || key !== column) throw new Error(`Unexpected outbox payload key ${key} for column ${column} on ${table}`);
    columns.push(column);
  }
  if (columns.length === 0) throw new Error(`Could not read the captured columns of ${table}`);
  return columns;
}

/** Creates `outbox_<table>_insert`, `_update`, `_update_merge`, `_delete` and
 * `_delete_merge` capturing `columns`. Requires `sync_queue.seq` (026). The
 * table must have none of these triggers yet. */
export function installMergingOutboxTriggers(
  db: SqliteDatabase,
  table: string,
  columns: readonly string[],
): void {
  const newJson = jsonObject('NEW', columns);
  const oldJson = jsonObject('OLD', columns);
  const captureOn = `(SELECT captureEnabled FROM sync_runtime WHERE id = 'singleton') = 1`;
  const now = `strftime('%Y-%m-%dT%H:%M:%fZ','now')`;
  const nextSeq = `(SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_queue)`;
  const latestActive = (row: 'NEW' | 'OLD') => `(
    SELECT rowid FROM sync_queue
     WHERE entityType = '${table}' AND entityId = ${row}.id AND status IN ('pending', 'in_flight')
     ORDER BY seq DESC, rowid DESC LIMIT 1)`;
  const unsent = `status = 'pending' AND deadLetter = 0 AND nextAttemptAt IS NULL`;
  const mergeTarget = (row: 'NEW' | 'OLD') =>
    `rowid = ${latestActive(row)} AND operationType = 'update' AND ${unsent}`;
  const enqueue = (row: 'NEW' | 'OLD', operation: string, payload: string) => `
    INSERT INTO sync_queue
      (id, entityType, entityId, operationType, payload, retryCount, status, createdAt, updatedAt, seq)
    VALUES
      (lower(hex(randomblob(16))), '${table}', ${row}.id, '${operation}', ${payload},
       0, 'pending', ${now}, ${now}, ${nextSeq});`;

  db.exec(`
    CREATE TRIGGER outbox_${table}_insert
    AFTER INSERT ON "${table}"
    WHEN ${captureOn}
    BEGIN
      ${enqueue('NEW', 'create', `json_object('record',${newJson})`)}
    END;

    CREATE TRIGGER outbox_${table}_update
    AFTER UPDATE ON "${table}"
    WHEN ${captureOn}
      AND NOT EXISTS (SELECT 1 FROM sync_queue WHERE ${mergeTarget('NEW')})
    BEGIN
      ${enqueue('NEW', 'update', `json_object('base',${oldJson},'record',${newJson})`)}
    END;

    CREATE TRIGGER outbox_${table}_update_merge
    AFTER UPDATE ON "${table}"
    WHEN ${captureOn}
      AND EXISTS (
        SELECT 1 FROM sync_queue
         WHERE ${mergeTarget('NEW')}
           AND json(json_extract(payload, '$.record')) IS NOT json(${newJson}))
    BEGIN
      UPDATE sync_queue
         SET payload = json_set(payload, '$.record', json(${newJson})),
             seq = ${nextSeq},
             updatedAt = ${now}
       WHERE ${mergeTarget('NEW')};
    END;

    CREATE TRIGGER outbox_${table}_delete
    AFTER DELETE ON "${table}"
    WHEN ${captureOn}
      AND NOT EXISTS (
        SELECT 1 FROM sync_queue
         WHERE rowid = ${latestActive('OLD')}
           AND operationType IN ('update', 'delete') AND ${unsent})
    BEGIN
      ${enqueue('OLD', 'delete', `json_object('base',${oldJson})`)}
    END;

    CREATE TRIGGER outbox_${table}_delete_merge
    AFTER DELETE ON "${table}"
    WHEN ${captureOn}
      AND EXISTS (SELECT 1 FROM sync_queue WHERE ${mergeTarget('OLD')})
    BEGIN
      UPDATE sync_queue
         SET operationType = 'delete',
             payload = json_remove(payload, '$.record'),
             seq = ${nextSeq},
             updatedAt = ${now}
       WHERE ${mergeTarget('OLD')};
    END;
  `);
}

function jsonObject(alias: 'NEW' | 'OLD', columns: readonly string[]): string {
  return `json_object(${columns
    .flatMap((column) => [`'${column}'`, `${alias}."${column}"`])
    .join(',')})`;
}
