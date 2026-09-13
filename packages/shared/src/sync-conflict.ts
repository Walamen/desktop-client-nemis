/**
 * Shared between the desktop sync worker (electron main, DesktopSyncWorker's
 * push loop) and the sync-conflicts UI (renderer, SyncConflictsPage's
 * diffFields/"no real disagreement" banner): the single definition of
 * whether a server-rejected push actually disagrees with the server on
 * something a person set, or is just sync bookkeeping/clock skew. Kept here,
 * not duplicated in each caller, so "what counts as a real disagreement"
 * can't quietly drift between the worker's silent auto-resolution and what
 * the conflicts screen tells the admin.
 */

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Every mutable-table row queued for offline sync is wrapped by the SQLite
 * outbox trigger (electron/database/migrations/010-create-sync-outbox.ts) as
 * `{ record: <new row> }` for creates, `{ base: <row before>, record: <row
 * after> }` for updates, and `{ base: <row before> }` for deletes — it is
 * never the bare entity row. `edited` is what the offline change actually
 * produced — the thing to compare against the server. `original` is the
 * pre-edit snapshot, useful only when there's no edited value to show (a
 * delete has no `record`). */
export function unwrapLocalPayload(payload: unknown): { edited: unknown; original: unknown } {
  if (isPlainObject(payload) && ('record' in payload || 'base' in payload)) {
    return { edited: payload['record'] ?? null, original: payload['base'] ?? null };
  }
  return { edited: payload, original: null };
}

// Pure sync plumbing — never meaningful for deciding whether two versions of
// a record actually disagree.
export const DIFF_IGNORED_KEYS = new Set(['id', 'deviceId']);

// CLAUDE.md's own "every synchronized entity should contain metadata" list
// (minus id/deviceId, already ignored above). Real, but never the thing a
// person is being asked to arbitrate.
export const SYNC_METADATA_KEYS = new Set(['version', 'updatedAt', 'createdAt', 'lastModifiedBy']);

export function isEmptyish(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

function toComparableDate(value: unknown): number | null {
  // Only coerce strings that already look date-shaped — Date.parse is too
  // lenient otherwise (it happily "parses" plenty of non-date strings).
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function toComparableBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  // SQLite has no boolean type — it stores 0/1. Only treat an actual 0 or 1
  // as boolean-equivalent, never any other number.
  if (value === 0 || value === 1) return Boolean(value);
  return null;
}

/** True when two values represent the same real-world fact even though they
 * don't look identical — "" vs null, "2026-08-17" vs its ISO datetime form,
 * SQLite's `1` vs a real `true`. Avoids flagging formatting differences
 * between SQLite and Postgres as if they were actual disagreements. */
export function valuesEqual(a: unknown, b: unknown): boolean {
  if (isEmptyish(a) && isEmptyish(b)) return true;
  if (JSON.stringify(a) === JSON.stringify(b)) return true;
  const dateA = toComparableDate(a);
  const dateB = toComparableDate(b);
  if (dateA !== null && dateB !== null) return dateA === dateB;
  const boolA = toComparableBoolean(a);
  const boolB = toComparableBoolean(b);
  if (boolA !== null && boolB !== null) return boolA === boolB;
  return false;
}

/**
 * Whether an offline change and the server's version of the same record
 * disagree on something a person actually set, as opposed to only differing
 * in server-assigned fields (a generated ID/status the offline entry
 * couldn't have known) or sync metadata (createdAt/updatedAt/version) — the
 * clock skew alone produces on an otherwise-identical create or edit.
 *
 * Returns `null` when either side isn't a plain record — the caller should
 * treat that as "can't tell" and fall back to surfacing the conflict rather
 * than guessing.
 */
export function hasRealDisagreement(local: unknown, remote: unknown): boolean | null {
  if (!isPlainObject(local) || !isPlainObject(remote)) return null;
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  for (const key of keys) {
    if (DIFF_IGNORED_KEYS.has(key) || SYNC_METADATA_KEYS.has(key)) continue;
    const localValue = local[key];
    const remoteValue = remote[key];
    if (valuesEqual(localValue, remoteValue)) continue;
    if (isEmptyish(localValue) && !isEmptyish(remoteValue)) continue; // server-assigned enrichment
    return true;
  }
  return false;
}
