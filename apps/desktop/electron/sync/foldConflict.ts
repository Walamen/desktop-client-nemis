import type { Database as SqliteDatabase } from 'better-sqlite3';
import { isPlainObject, unwrapLocalPayload } from '@nemis-desktop/shared';

export type QueuedOperationType = 'create' | 'update' | 'delete';

export interface RefusedChange {
  entityType: string;
  entityId: string;
  operationType: QueuedOperationType;
  /** The refused queue row's payload: `{record}`, `{base, record}` or `{base}`. */
  payload: unknown;
}

export interface FoldedChange {
  operationType: QueuedOperationType;
  payload: { base?: unknown; record?: unknown };
}

/**
 * Folds the record's later queued changes into a change the server refused as
 * a conflict, so the conflict shows (and the auto-resolve check judges) what
 * the record looks like locally NOW, not a stale intermediate edit.
 *
 * Reads that record's `pending` rows (backed-off ones included) in `seq`
 * order and deletes them. The result keeps the refused change's `base` (the
 * version this device last saw from the server) and takes the latest
 * `record`. A final delete makes it a delete with no record; a refused create
 * stays a create carrying the latest record. With no followers the refused
 * change comes back unchanged.
 *
 * Must run inside the acknowledgement transaction: the refused row itself is
 * still `in_flight` there and is not touched.
 */
export function foldPendingFollowers(db: SqliteDatabase, refused: RefusedChange): FoldedChange {
  const followers = db
    .prepare(
      `SELECT id, operationType, payload FROM sync_queue
        WHERE entityType = ? AND entityId = ? AND status = 'pending'
        ORDER BY seq, createdAt, id`,
    )
    .all(refused.entityType, refused.entityId) as Array<{ id: string; operationType: QueuedOperationType; payload: string }>;
  const last = followers[followers.length - 1];
  if (!last) return { operationType: refused.operationType, payload: refused.payload as FoldedChange['payload'] };

  const remove = db.prepare(`DELETE FROM sync_queue WHERE id = ?`);
  for (const follower of followers) remove.run(follower.id);

  const base = isPlainObject(refused.payload) ? refused.payload['base'] : undefined;
  const withBase = base === undefined ? {} : { base };
  if (last.operationType === 'delete') return { operationType: 'delete', payload: withBase };

  const operationType: QueuedOperationType =
    refused.operationType === 'create' ? 'create' : refused.operationType === 'delete' ? last.operationType : 'update';
  return { operationType, payload: { ...withBase, record: unwrapLocalPayload(parse(last.payload)).edited } };
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
