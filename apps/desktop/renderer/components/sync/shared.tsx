/** Pure presentation helpers for the sync-conflicts screen — turning raw
 * entity payloads (shape varies per entityType, hence `unknown`) into
 * something a person can actually read and compare. No business logic
 * lives here, only formatting of data the backend already produced. */

/** - 'content': the two sides genuinely disagree on something a person set —
 *    the only bucket that actually needs a decision.
 *  - 'serverAssigned': the offline entry had nothing here and the server
 *    filled it in on its own (a generated ID, a default status) — not a
 *    disagreement, just enrichment only the server could have produced.
 *  - 'metadata': sync bookkeeping (see SYNC_METADATA_KEYS) — never
 *    meaningful to compare by itself, shown only for the curious.
 *  - 'unchanged': the two sides already agree. */
export type DiffBucket = 'content' | 'serverAssigned' | 'metadata' | 'unchanged';

export interface DiffRow {
  key: string;
  label: string;
  local: string;
  remote: string;
  bucket: DiffBucket;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Every mutable-table row queued for offline sync is wrapped by the SQLite
 * outbox trigger (electron/database/migrations/010-create-sync-outbox.ts) as
 * `{ record: <new row> }` for creates, `{ base: <row before>, record: <row
 * after> }` for updates, and `{ base: <row before> }` for deletes — it is
 * never the bare entity row. `sync_conflicts.localPayload` and the
 * dead-letter queue's payload are both this same envelope, unlike
 * `remotePayload`, which the server always returns as a flat record.
 * `edited` is what the offline change actually produced — the thing to
 * compare against the server. `original` is the pre-edit snapshot, useful
 * only when there's no edited value to show (a delete has no `record`). */
export function unwrapLocalPayload(payload: unknown): { edited: unknown; original: unknown } {
  if (isPlainObject(payload) && ('record' in payload || 'base' in payload)) {
    return { edited: payload['record'] ?? null, original: payload['base'] ?? null };
  }
  return { edited: payload, original: null };
}

// Pure sync plumbing — never meaningful for a person deciding between two
// versions of the same record.
const DIFF_IGNORED_KEYS = new Set(['id', 'deviceId']);

// CLAUDE.md's own "every synchronized entity should contain metadata" list
// (minus id/deviceId, already ignored above). Real, but never the thing a
// person is being asked to arbitrate — folded into the details disclosure.
const SYNC_METADATA_KEYS = new Set(['version', 'updatedAt', 'createdAt', 'lastModifiedBy']);

function isEmptyish(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

const NAME_KEYS = [
  'fullName', 'name', 'title', 'displayName',
  'studentName', 'staffName', 'className', 'subjectName',
];

/** "enrollmentStatus" -> "Enrollment status", "classId" -> "Class ID". */
export function humanizeKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words
    .map((word, index) => {
      if (word.toLowerCase() === 'id') return 'ID';
      return index === 0 ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word.toLowerCase();
    })
    .join(' ');
}

/** "FEE_PAYMENT" -> "Fee Payment". */
export function humanizeEntityType(entityType: string): string {
  return entityType
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/;

export function formatValue(value: unknown): string {
  if (isEmptyish(value)) return '— empty —';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' && ISO_DATE_RE.test(value)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
  }
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '— empty —';
    return value.map((item) => (isPlainObject(item) || Array.isArray(item) ? JSON.stringify(item) : String(item))).join(', ');
  }
  if (isPlainObject(value)) {
    try {
      return JSON.stringify(value);
    } catch {
      return '[unreadable value]';
    }
  }
  return String(value);
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

/** Field-level comparison between the two preserved payloads, bucketed so
 * the caller can tell a real disagreement apart from server enrichment and
 * sync bookkeeping. Falls back to `comparable: false` when either side
 * isn't a plain record — the caller should show a raw-data fallback then. */
export function diffFields(local: unknown, remote: unknown): { rows: DiffRow[]; comparable: boolean } {
  if (!isPlainObject(local) || !isPlainObject(remote)) {
    return { rows: [], comparable: false };
  }
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  const rows: DiffRow[] = [];
  for (const key of keys) {
    if (DIFF_IGNORED_KEYS.has(key)) continue;
    const localValue = local[key];
    const remoteValue = remote[key];
    const equal = valuesEqual(localValue, remoteValue);
    let bucket: DiffBucket;
    if (equal) {
      bucket = 'unchanged';
    } else if (SYNC_METADATA_KEYS.has(key)) {
      bucket = 'metadata';
    } else if (isEmptyish(localValue) && !isEmptyish(remoteValue)) {
      bucket = 'serverAssigned';
    } else {
      bucket = 'content';
    }
    rows.push({ key, label: humanizeKey(key), local: formatValue(localValue), remote: formatValue(remoteValue), bucket });
  }
  const bucketOrder: Record<DiffBucket, number> = { content: 0, serverAssigned: 1, metadata: 2, unchanged: 3 };
  rows.sort((a, b) => bucketOrder[a.bucket] - bucketOrder[b.bucket] || a.label.localeCompare(b.label));
  return { rows, comparable: true };
}

/** Best-effort human label for the affected record — a name beats a UUID. */
export function pickEntityLabel(
  localPayload: unknown,
  remotePayload: unknown,
  entityType: string,
  entityId: string,
): string {
  const { edited, original } = unwrapLocalPayload(localPayload);
  for (const payload of [edited, original, remotePayload]) {
    if (!isPlainObject(payload)) continue;
    for (const key of NAME_KEYS) {
      const value = payload[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    const first = payload['firstName'];
    const last = payload['lastName'];
    if ((typeof first === 'string' && first) || (typeof last === 'string' && last)) {
      return [first, last].filter((part) => typeof part === 'string' && part).join(' ');
    }
  }
  const shortId = entityId.length > 8 ? `${entityId.slice(0, 8)}…` : entityId;
  return `${humanizeEntityType(entityType)} · ${shortId}`;
}

export function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}
