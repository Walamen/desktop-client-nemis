import fs from 'node:fs';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { nowIso } from '../helpers/time';

export interface HealthReport {
  ok: boolean;
  quickCheck: string;
  foreignKeyViolations: number;
  pageCount: number;
  pageSize: number;
  databaseSizeBytes: number;
  walSizeBytes: number;
  schemaVersion: number;
  checkedAt: string;
}

function fileSize(filePath: string): number {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

/**
 * Read-only diagnostics. check() is cheap enough for startup and future
 * status surfaces; fullIntegrityCheck() walks every page — reserve it for
 * support tooling and pre-restore validation.
 */
export class DatabaseHealthService {
  readonly #db: SqliteDatabase;
  readonly #databaseFile: string;

  constructor(db: SqliteDatabase, databaseFile: string) {
    this.#db = db;
    this.#databaseFile = databaseFile;
  }

  check(): HealthReport {
    const quickCheck = this.#db.pragma('quick_check', { simple: true }) as string;
    const foreignKeyViolations = (this.#db.pragma('foreign_key_check') as unknown[]).length;
    const pageCount = this.#db.pragma('page_count', { simple: true }) as number;
    const pageSize = this.#db.pragma('page_size', { simple: true }) as number;
    const schemaVersion = this.#db.pragma('user_version', { simple: true }) as number;
    return {
      ok: quickCheck === 'ok' && foreignKeyViolations === 0,
      quickCheck,
      foreignKeyViolations,
      pageCount,
      pageSize,
      databaseSizeBytes: fileSize(this.#databaseFile),
      walSizeBytes: fileSize(`${this.#databaseFile}-wal`),
      schemaVersion,
      checkedAt: nowIso(),
    };
  }

  fullIntegrityCheck(): { ok: boolean; errors: string[] } {
    const rows = this.#db.pragma('integrity_check') as Array<{ integrity_check: string }>;
    const errors = rows.map((row) => row.integrity_check).filter((line) => line !== 'ok');
    return { ok: errors.length === 0, errors };
  }
}
