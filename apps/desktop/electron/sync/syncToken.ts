import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { DesktopSyncToken } from '@nemis-desktop/types';

// Same rule as the server's serverToken and `sharedTimestamp` in
// desktop-sync-applier.ts: the first of these present and parseable on BOTH rows.
const TOKEN_FIELDS = ['updatedAt', 'assignedAt', 'createdAt'] as const;

function parsed(value: unknown): number | null {
  if (typeof value !== 'string' && !(value instanceof Date)) return null;
  const time = new Date(value).valueOf();
  return Number.isNaN(time) ? null : time;
}

/** The concurrency token of `remote`, or null when the rows share no timestamp. */
export function tokenFromRemote(
  local: Record<string, unknown>,
  remote: Record<string, unknown>,
): DesktopSyncToken | null {
  for (const field of TOKEN_FIELDS) {
    if (parsed(local[field]) === null) continue;
    const remoteTime = parsed(remote[field]);
    if (remoteTime === null) continue;
    return { field, value: new Date(remoteTime).toISOString() };
  }
  return null;
}

function isTokenField(field: string): field is DesktopSyncToken['field'] {
  return (TOKEN_FIELDS as readonly string[]).includes(field);
}

/** Moves the `base` token of this record's waiting queue rows (backed-off ones
 *  included) to `token`. Returns how many rows changed. */
export function rebaseQueued(
  db: SqliteDatabase,
  entityType: string,
  entityId: string,
  token: DesktopSyncToken,
): number {
  if (!isTokenField(token.field)) return 0;
  // token.field is one of three literal names (checked above), never user input.
  const result = db
    .prepare(
      `UPDATE sync_queue
          SET payload = json_set(payload, '$.base.${token.field}', ?)
        WHERE entityType = ? AND entityId = ? AND status = 'pending'
          AND json_valid(payload) AND json_type(payload, '$.base') = 'object'`,
    )
    .run(token.value, entityType, entityId);
  return result.changes;
}

/** Stores the server's token on the local row without queueing it as an edit. */
export function writeBackToken(
  db: SqliteDatabase,
  entityType: string,
  entityId: string,
  token: DesktopSyncToken,
): void {
  if (!isTokenField(token.field)) return;
  // Only tables that sync through the outbox (same check as resolveConflict),
  // which also guarantees the name is a real table, safe to interpolate.
  const queueBacked = db
    .prepare(`SELECT 1 FROM sqlite_master WHERE type='trigger' AND name=?`)
    .get(`outbox_${entityType}_insert`);
  if (!queueBacked) return;
  const columns = db.pragma(`table_info("${entityType.replace(/"/g, '""')}")`) as { name: string }[];
  if (!columns.some((column) => column.name === token.field)) return;

  db.prepare(`UPDATE sync_runtime SET captureEnabled=0 WHERE id='singleton'`).run();
  try {
    db.prepare(`UPDATE "${entityType}" SET ${token.field}=? WHERE id=?`).run(token.value, entityId);
  } finally {
    db.prepare(`UPDATE sync_runtime SET captureEnabled=1 WHERE id='singleton'`).run();
  }
}

/** The remote's own token, for when the local side has no timestamp to pair it with. */
export function tokenFromRemoteAlone(remote: Record<string, unknown>): DesktopSyncToken | null {
  for (const field of TOKEN_FIELDS) {
    const time = parsed(remote[field]);
    if (time !== null) return { field, value: new Date(time).toISOString() };
  }
  return null;
}
