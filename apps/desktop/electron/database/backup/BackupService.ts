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

function isValidSqliteFile(filePath: string): boolean {
  if (!fs.existsSync(filePath)) {
    return false;
  }
  let raw: SqliteDatabase | null = null;
  try {
    raw = new BetterSqlite3(filePath, { readonly: true });
    return (raw.pragma('quick_check', { simple: true }) as string) === 'ok';
  } catch {
    return false;
  } finally {
    raw?.close();
  }
}

/**
 * Online backups via SQLite's backup API: safe while the app is running
 * (WAL readers/writers continue). Every backup is quick_check-validated
 * before being reported; a backup that fails validation is deleted.
 * Infrastructure only — scheduling/retention/UI arrive in later phases.
 */
export class BackupService {
  readonly #db: SqliteDatabase;
  readonly #backupsDirectory: string;

  constructor(db: SqliteDatabase, backupsDirectory: string) {
    this.#db = db;
    this.#backupsDirectory = backupsDirectory;
  }

  async createBackup(label?: string): Promise<BackupResult> {
    fs.mkdirSync(this.#backupsDirectory, { recursive: true });
    const filePath = path.join(this.#backupsDirectory, buildBackupFileName(new Date(), label));
    try {
      await this.#db.backup(filePath);
    } catch (error) {
      fs.rmSync(filePath, { force: true });
      throw new BackupError(`Backup to ${filePath} failed`, { cause: error });
    }
    if (!isValidSqliteFile(filePath)) {
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
    return isValidSqliteFile(filePath);
  }
}

/**
 * Replaces the live database file with a validated backup.
 * CONTRACT: the main connection must be CLOSED before calling
 * (DatabaseManager.shutdown() → restoreBackup() → initialize()).
 * Copies to a temp sibling then renames, and removes stale -wal/-shm files
 * so SQLite cannot pair the restored file with an old journal.
 */
export function restoreBackup(sourceFile: string, databaseFile: string): void {
  if (!isValidSqliteFile(sourceFile)) {
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
