/** Pure presentation helpers for the sync-conflicts screen — turning raw
 * entity payloads (shape varies per entityType, hence `unknown`) into
 * something a person can actually read and compare. No business logic
 * lives here, only formatting of data the backend already produced. The
 * underlying "what counts as a real disagreement" rules (isPlainObject,
 * unwrapLocalPayload, valuesEqual, the ignored/metadata key sets) live in
 * @nemis-desktop/shared instead of being redefined here, so this screen's
 * diff and DesktopSyncWorker's own silent auto-resolution of false-positive
 * conflicts can never quietly drift apart on the same question. */
import { DIFF_IGNORED_KEYS, SYNC_METADATA_KEYS, isEmptyish, isPlainObject, unwrapLocalPayload, valuesEqual } from '@nemis-desktop/shared';

export { isPlainObject, unwrapLocalPayload };
export { humanizeEntityType, pickEntityLabel } from '@nemis-desktop/shared';

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

/** "in 4 min" for a future retry time; "now" once it has passed. */
export function retryCountdown(dateStr: string, now = Date.now()): string {
  const ms = new Date(dateStr).getTime() - now;
  if (!(ms > 0)) return 'now';
  if (ms <= 60_000) return 'in under a minute';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `in ${mins} min`;
  return `in ${Math.round(mins / 60)} h`;
}
