import fs from 'node:fs';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { BackupError } from '../errors/errors';
import { nowIso } from '../helpers/time';
import { buildBackupFileName } from './backupFileName';

export interface BackupResult {
  filePath: string;
  sizeBytes: number;
  createdAt: string;
}

// Mirrors Database.ts's own ENCRYPTION_KEY_PATTERN. Re-declared rather than
// imported so this module doesn't reach into Database's privates for a
// one-line regex; keep the two in sync if the key format ever changes.
const ENCRYPTION_KEY_PATTERN = /^[0-9a-f]{64}$/i;

function assertValidEncryptionKey(encryptionKey: string): string {
  if (!ENCRYPTION_KEY_PATTERN.test(encryptionKey)) {
    // Validated before any file I/O, same discipline as Database.open.
    throw new BackupError('Encryption key must be 64 hexadecimal characters');
  }
  return encryptionKey.toLowerCase();
}

/**
 * Opens `filePath` readonly and quick_check-validates it. When `encryptionKey`
 * is configured, the SQLCipher pragmas are applied BEFORE quick_check —
 * mirroring Database.#applyEncryption's non-migration branch — so a genuinely
 * valid encrypted file validates correctly instead of failing quick_check as
 * if it were corrupt. Without a key, behaves exactly as before (plaintext-only).
 */
function isValidSqliteFile(filePath: string, encryptionKey?: string): boolean {
  if (!fs.existsSync(filePath)) {
    return false;
  }
  let raw: SqliteDatabase | null = null;
  try {
    raw = new BetterSqlite3(filePath, { readonly: true });
    if (encryptionKey !== undefined) {
      raw.pragma(`cipher='sqlcipher'`);
      raw.pragma(`hexkey='${encryptionKey}'`);
    }
    return (raw.pragma('quick_check', { simple: true }) as string) === 'ok';
  } catch {
    // Best-effort validity check: any failure (bad header, wrong/missing key,
    // corruption) collapses to "not valid" rather than propagating.
    return false;
  } finally {
    raw?.close();
  }
}

/**
 * Online backups: safe while the app is running (WAL readers/writers
 * continue). Every backup is quick_check-validated before being reported;
 * a backup that fails validation is deleted. Infrastructure only —
 * scheduling/retention/UI arrive in later phases.
 *
 * Two primitives are used depending on whether the source is encrypted,
 * chosen from an empirical check (see .superpowers/sdd report for Phase
 * 3.5): better-sqlite3(-multiple-ciphers)'s online backup API (`db.backup()`)
 * always opens an UNKEYED connection to the destination internally, and
 * throws ("backup is not supported with incompatible source and target
 * databases") rather than silently writing plaintext when the source is
 * encrypted — so it is safe, just unusable, for encrypted sources. For those,
 * `VACUUM INTO` is executed on the already-keyed source connection instead;
 * it inherits that connection's cipher/key state, so the destination file
 * comes out equally encrypted. `encryptionKey`, when configured, is also
 * applied when validating candidate files (createBackup's post-backup check,
 * validateBackup) so encrypted databases aren't misdiagnosed as corrupt.
 */
export class BackupService {
  readonly #db: SqliteDatabase;
  readonly #backupsDirectory: string;
  readonly #encryptionKey: string | undefined;

  constructor(db: SqliteDatabase, backupsDirectory: string, encryptionKey?: string) {
    this.#db = db;
    this.#backupsDirectory = backupsDirectory;
    this.#encryptionKey =
      encryptionKey === undefined ? undefined : assertValidEncryptionKey(encryptionKey);
  }

  async createBackup(label?: string): Promise<BackupResult> {
    fs.mkdirSync(this.#backupsDirectory, { recursive: true });
    const filePath = path.join(this.#backupsDirectory, buildBackupFileName(new Date(), label));
    if (fs.existsSync(filePath)) {
      throw new BackupError(`Backup target already exists: ${filePath}`);
    }
    try {
      if (this.#encryptionKey !== undefined) {
        // See the class doc: the backup API can't pair a keyed source with
        // its unkeyed destination connection, so VACUUM INTO on this (keyed)
        // connection is used instead — it writes an equally-encrypted copy.
        this.#db.exec(`VACUUM INTO '${filePath.replace(/'/g, "''")}'`);
      } else {
        await this.#db.backup(filePath);
      }
    } catch (error) {
      fs.rmSync(filePath, { force: true });
      throw new BackupError(`Backup to ${filePath} failed`, { cause: error });
    }
    if (!isValidSqliteFile(filePath, this.#encryptionKey)) {
      fs.rmSync(filePath, { force: true });
      throw new BackupError(`Backup at ${filePath} failed validation and was removed`);
    }
    return { filePath, sizeBytes: fs.statSync(filePath).size, createdAt: nowIso() };
  }

  /** Full paths, newest first (file names embed a sortable UTC timestamp). */
  listBackups(): string[] {
    if (!fs.existsSync(this.#backupsDirectory)) {
      return [];
    }
    return fs
      .readdirSync(this.#backupsDirectory)
      .filter((name) => name.startsWith('nemis-') && name.endsWith('.db'))
      .sort()
      .reverse()
      .map((name) => path.join(this.#backupsDirectory, name));
  }

  validateBackup(filePath: string): boolean {
    return isValidSqliteFile(filePath, this.#encryptionKey);
  }
}

/**
 * Replaces the live database file with a validated backup.
 * CONTRACT: the main connection must be CLOSED before calling
 * (DatabaseManager.shutdown() → restoreBackup() → initialize()).
 * Copies to a temp sibling then renames, and removes stale -wal/-shm files
 * so SQLite cannot pair the restored file with an old journal.
 * `encryptionKey`, when the backup is encrypted, must match the key it was
 * created with — validated with the same rule as Database.open/BackupService.
 */
export function restoreBackup(
  sourceFile: string,
  databaseFile: string,
  encryptionKey?: string,
): void {
  const key = encryptionKey === undefined ? undefined : assertValidEncryptionKey(encryptionKey);
  if (!isValidSqliteFile(sourceFile, key)) {
    throw new BackupError(`Restore source is not a valid database: ${sourceFile}`);
  }
  const tempFile = `${databaseFile}.restore-tmp`;
  try {
    fs.copyFileSync(sourceFile, tempFile);
    fs.renameSync(tempFile, databaseFile);
    fs.rmSync(`${databaseFile}-wal`, { force: true });
    fs.rmSync(`${databaseFile}-shm`, { force: true });
  } catch (error) {
    fs.rmSync(tempFile, { force: true });
    throw new BackupError(`Restore to ${databaseFile} failed`, { cause: error });
  }
}
