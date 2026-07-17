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
  /** 64-char hex (256-bit) key. When set, the database is opened (or migrated) SQLCipher-encrypted. */
  encryptionKey?: string;
}

const ENCRYPTION_KEY_PATTERN = /^[0-9a-f]{64}$/i;
const PLAINTEXT_HEADER = Buffer.from('SQLite format 3\u0000', 'latin1');

/**
 * Owns exactly one better-sqlite3 connection: creation, validation,
 * pragma configuration, and clean close. Nothing else touches the driver
 * constructor — services receive `raw` by injection.
 */
export class Database {
  #raw: SqliteDatabase | null;
  readonly #filePath: string;
  readonly #wasEncryptedInPlace: boolean;

  private constructor(raw: SqliteDatabase, filePath: string, wasEncryptedInPlace: boolean) {
    this.#raw = raw;
    this.#filePath = filePath;
    this.#wasEncryptedInPlace = wasEncryptedInPlace;
  }

  static open(options: DatabaseOptions): Database {
    const { filePath, readonly = false, encryptionKey } = options;
    if (encryptionKey !== undefined && !ENCRYPTION_KEY_PATTERN.test(encryptionKey)) {
      // Validated BEFORE any file I/O; also makes the pragma interpolation
      // below injection-safe (hex chars only).
      throw new ConnectionError('Encryption key must be 64 hexadecimal characters');
    }
    if (filePath !== ':memory:') {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }
    const needsMigration =
      encryptionKey !== undefined &&
      filePath !== ':memory:' &&
      Database.#hasPlaintextData(filePath);
    let raw: SqliteDatabase;
    try {
      raw = new BetterSqlite3(filePath, { readonly });
    } catch (error) {
      throw new ConnectionError(`Cannot open database at ${filePath}`, { cause: error });
    }
    try {
      if (encryptionKey !== undefined) {
        Database.#applyEncryption(raw, encryptionKey.toLowerCase(), needsMigration);
      }
      if (!readonly) {
        Database.#applyPragmas(raw);
      }
      const check = raw.pragma('quick_check', { simple: true }) as string;
      if (check !== 'ok') {
        throw new IntegrityError(`Database failed validation at open: ${check}`);
      }
      return new Database(raw, filePath, needsMigration);
    } catch (error) {
      raw.close();
      throw wrapSqliteError(error, `open ${filePath}`);
    }
  }

  /** True when the file exists with content and carries the unencrypted SQLite header. */
  static #hasPlaintextData(filePath: string): boolean {
    let fd: number;
    try {
      fd = fs.openSync(filePath, 'r');
    } catch {
      return false; // no file yet — a fresh encrypted database will be created
    }
    try {
      const header = Buffer.alloc(PLAINTEXT_HEADER.length);
      const bytesRead = fs.readSync(fd, header, 0, header.length, 0);
      return bytesRead === header.length && header.equals(PLAINTEXT_HEADER);
    } finally {
      fs.closeSync(fd);
    }
  }

  /**
   * Encryption pragmas must run before ANY other statement. SQLCipher-4
   * compatible scheme (project standard). Migration path: an existing
   * plaintext database (all pre-3.5 installs) is encrypted in place via
   * rekey — which requires a rollback journal, hence the temporary
   * journal_mode=DELETE (the WAL pragma is restored by #applyPragmas).
   */
  static #applyEncryption(raw: SqliteDatabase, hexKey: string, migrate: boolean): void {
    raw.pragma(`cipher='sqlcipher'`);
    if (migrate) {
      raw.pragma('journal_mode = DELETE');
      raw.pragma(`hexrekey='${hexKey}'`);
    } else {
      raw.pragma(`hexkey='${hexKey}'`);
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

  /** True when this open performed the one-time plaintext→encrypted migration. */
  get wasEncryptedInPlace(): boolean {
    return this.#wasEncryptedInPlace;
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
