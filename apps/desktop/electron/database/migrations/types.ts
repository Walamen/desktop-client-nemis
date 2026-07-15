import type { Database as SqliteDatabase } from 'better-sqlite3';

/**
 * One schema change. `version` is a positive integer, unique across the
 * registry, applied in ascending order. `down` is optional — destructive
 * migrations may be irreversible; rollbackLast() refuses those explicitly.
 */
export interface Migration {
  readonly version: number;
  readonly name: string;
  up(db: SqliteDatabase): void;
  down?(db: SqliteDatabase): void;
}
