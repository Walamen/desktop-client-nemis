import fs from 'node:fs';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { PRAGMAS } from './constants/pragmas';
import { ConnectionError, IntegrityError } from './errors/errors';
import { wrapSqliteError } from './errors/wrapSqliteError';

export interface DatabaseOptions {
  filePath: string;
  readonly?: boolean;
}

/**
 * Owns exactly one better-sqlite3 connection: creation, validation,
 * pragma configuration, and clean close. Nothing else touches the driver
 * constructor — services receive `raw` by injection.
 */
export class Database {
  #raw: SqliteDatabase | null;
  readonly #filePath: string;

  private constructor(raw: SqliteDatabase, filePath: string) {
    this.#raw = raw;
    this.#filePath = filePath;
  }

  static open(options: DatabaseOptions): Database {
    const { filePath, readonly = false } = options;
    if (filePath !== ':memory:') {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }
    let raw: SqliteDatabase;
    try {
      raw = new BetterSqlite3(filePath, { readonly });
    } catch (error) {
      throw new ConnectionError(`Cannot open database at ${filePath}`, { cause: error });
    }
    try {
      if (!readonly) {
        Database.#applyPragmas(raw);
      }
      const check = raw.pragma('quick_check', { simple: true }) as string;
      if (check !== 'ok') {
        throw new IntegrityError(`Database failed validation at open: ${check}`);
      }
      return new Database(raw, filePath);
    } catch (error) {
      raw.close();
      throw wrapSqliteError(error, `open ${filePath}`);
    }
  }

  static #applyPragmas(raw: SqliteDatabase): void {
    raw.pragma(`busy_timeout = ${PRAGMAS.busyTimeoutMs}`);
    raw.pragma(`journal_mode = ${PRAGMAS.journalMode}`);
    raw.pragma(`synchronous = ${PRAGMAS.synchronous}`);
    raw.pragma(`foreign_keys = ${PRAGMAS.foreignKeys}`);
    raw.pragma(`cache_size = -${PRAGMAS.cacheSizeKib}`);
    raw.pragma(`temp_store = ${PRAGMAS.tempStore}`);
    raw.pragma(`wal_autocheckpoint = ${PRAGMAS.walAutocheckpointPages}`);
    raw.pragma(`journal_size_limit = ${PRAGMAS.journalSizeLimitBytes}`);
    if ((raw.pragma('foreign_keys', { simple: true }) as number) !== 1) {
      throw new ConnectionError('foreign_keys pragma did not take effect');
    }
  }

  get raw(): SqliteDatabase {
    if (this.#raw === null) {
      throw new ConnectionError('Database is closed');
    }
    return this.#raw;
  }

  get filePath(): string {
    return this.#filePath;
  }

  get isOpen(): boolean {
    return this.#raw !== null && this.#raw.open;
  }

  /**
   * Checkpoints the WAL into the main file, lets SQLite refresh query-planner
   * statistics, then closes. Idempotent: safe to call from multiple shutdown paths.
   */
  close(): void {
    if (this.#raw === null) {
      return;
    }
    const raw = this.#raw;
    this.#raw = null;
    try {
      if (!raw.readonly) {
        raw.pragma('wal_checkpoint(TRUNCATE)');
        raw.pragma('optimize');
      }
    } catch {
      // Best-effort maintenance; close() below is what must not fail silently.
    } finally {
      raw.close();
    }
  }
}
