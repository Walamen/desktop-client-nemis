import type { Database as SqliteDatabase } from 'better-sqlite3';
import type {
  PendingGroupSummary,
  PendingRecord,
  PendingSource,
} from '@nemis-desktop/types';

/** What every pending source reads against: the active workspace's
 * connection, its institution (grade completions are institution-scoped,
 * like their push), and one clock reading for the whole call. */
export interface PendingContext {
  db: SqliteDatabase;
  institutionId: string;
  now: string;
}

/** A record before PendingLabelResolver names it. */
export type RawPendingRow = Omit<PendingRecord, 'label'>;

export interface PendingSourceAdapter {
  readonly source: PendingSource;
  summarize(ctx: PendingContext): PendingGroupSummary[];
  listRecords(
    ctx: PendingContext,
    entityType: string,
    limit: number,
    offset: number,
  ): { rows: RawPendingRow[]; total: number };
  countPending(ctx: PendingContext): number;
  countFailed(ctx: PendingContext): number;
}

/** sync_queue.payload is TEXT; a NULL or malformed one must not hide the row. */
export function parsePayload(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
