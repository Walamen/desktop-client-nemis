import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { Database } from '../Database';
import { BackupError } from '../errors/errors';
import { createTestDatabase, type TestDatabase } from '../testing/createTestDatabase';
import { BackupService, restoreBackup } from './BackupService';

const ENCRYPTION_KEY = 'a'.repeat(64);
const PLAINTEXT_HEADER = 'SQLite format 3\0';

function readHeader(filePath: string): string {
  const buffer = Buffer.alloc(16);
  const fd = fs.openSync(filePath, 'r');
  try {
    fs.readSync(fd, buffer, 0, 16, 0);
  } finally {
    fs.closeSync(fd);
  }
  return buffer.toString('latin1');
}

describe('BackupService', () => {
  let test: TestDatabase;
  let backupsDir: string;
  let service: BackupService;

  beforeEach(() => {
    test = createTestDatabase();
    test.db.raw.exec('CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT)');
    test.db.raw.prepare("INSERT INTO notes VALUES ('1', 'hello')").run();
    backupsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-backups-'));
    service = new BackupService(test.db.raw, backupsDir);
  });

  afterEach(() => {
    test.cleanup();
    fs.rmSync(backupsDir, { recursive: true, force: true });
  });

  it('creates a validated backup while the source connection is open', async () => {
    const result = await service.createBackup('unit');
    expect(fs.existsSync(result.filePath)).toBe(true);
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(service.validateBackup(result.filePath)).toBe(true);
    const copy = new BetterSqlite3(result.filePath, { readonly: true });
    const row = copy.prepare('SELECT body FROM notes WHERE id = ?').get('1') as { body: string };
    copy.close();
    expect(row.body).toBe('hello');
  });

  it('lists backups newest-first', async () => {
    await service.createBackup('a');
    await service.createBackup('b');
    const listed = service.listBackups();
    expect(listed).toHaveLength(2);
    // Names embed a sortable timestamp; same-second backups differ by label,
    // and descending name order still puts 'b' first.
    expect(listed[0]!.endsWith('-b.db')).toBe(true);
    expect(listed[1]!.endsWith('-a.db')).toBe(true);
  });

  it('validateBackup rejects a non-database file', () => {
    const bogus = path.join(backupsDir, 'bogus.db');
    fs.writeFileSync(bogus, 'not a database');
    expect(service.validateBackup(bogus)).toBe(false);
  });

  it('restoreBackup replaces the target and rejects invalid sources', async () => {
    const backup = await service.createBackup('restore-me');
    test.db.raw.prepare("UPDATE notes SET body = 'changed' WHERE id = '1'").run();
    test.db.close(); // contract: connection must be closed before restore

    restoreBackup(backup.filePath, test.filePath);
    const restored = new BetterSqlite3(test.filePath, { readonly: true });
    const row = restored.prepare("SELECT body FROM notes WHERE id = '1'").get() as {
      body: string;
    };
    restored.close();
    expect(row.body).toBe('hello');

    const bogus = path.join(backupsDir, 'bogus.db');
    fs.writeFileSync(bogus, 'junk');
    expect(() => restoreBackup(bogus, test.filePath)).toThrow(BackupError);
  });
});

describe('BackupService with an encrypted source database', () => {
  let directory: string;
  let filePath: string;
  let db: ReturnType<typeof Database.open>;
  let backupsDir: string;
  let service: BackupService;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-enc-backup-'));
    filePath = path.join(directory, 'test.db');
    db = Database.open({ filePath, encryptionKey: ENCRYPTION_KEY });
    db.raw.exec('CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT)');
    db.raw.prepare("INSERT INTO notes VALUES ('1', 'hello')").run();
    backupsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-backups-enc-'));
    service = new BackupService(db.raw, backupsDir, ENCRYPTION_KEY);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
    fs.rmSync(backupsDir, { recursive: true, force: true });
  });

  it(
    'creates an encrypted backup of an encrypted source (via VACUUM INTO on the ' +
      "keyed connection) — the backup file's header is ciphertext, not the " +
      "plaintext SQLite header, and it round-trips through the source's own key",
    async () => {
      const result = await service.createBackup('enc');
      expect(fs.existsSync(result.filePath)).toBe(true);
      expect(result.sizeBytes).toBeGreaterThan(0);
      expect(readHeader(result.filePath)).not.toBe(PLAINTEXT_HEADER);
      expect(service.validateBackup(result.filePath)).toBe(true);

      const copy = new BetterSqlite3(result.filePath, { readonly: true });
      copy.pragma(`cipher='sqlcipher'`);
      copy.pragma(`hexkey='${ENCRYPTION_KEY}'`);
      const row = copy.prepare("SELECT body FROM notes WHERE id = '1'").get() as {
        body: string;
      };
      copy.close();
      expect(row.body).toBe('hello');
    },
  );

  it('an encrypted backup cannot be read without the key (still real ciphertext, not just a validation gate)', async () => {
    const result = await service.createBackup('enc-noleak');
    const copy = new BetterSqlite3(result.filePath, { readonly: true });
    try {
      expect(() => copy.pragma('quick_check', { simple: true })).toThrow();
    } finally {
      copy.close();
    }
  });

  it('createBackup + restoreBackup round-trips an encrypted database end to end', async () => {
    const backup = await service.createBackup('restore-me-enc');
    db.raw.prepare("UPDATE notes SET body = 'changed' WHERE id = '1'").run();
    db.close(); // contract: connection must be closed before restore

    restoreBackup(backup.filePath, filePath, ENCRYPTION_KEY);
    const restored = Database.open({ filePath, encryptionKey: ENCRYPTION_KEY });
    const row = restored.raw.prepare("SELECT body FROM notes WHERE id = '1'").get() as {
      body: string;
    };
    restored.close();
    expect(row.body).toBe('hello');

    // afterEach calls db.close() again; make that a no-op instead of erroring.
    db = Database.open({ filePath, encryptionKey: ENCRYPTION_KEY });
  });

  it('validateBackup/restoreBackup recognize a genuinely encrypted database file when the key is configured, and reject it without one', () => {
    // Independent of createBackup: proves the key-aware validation/restore
    // logic is correct against a real encrypted SQLite file built directly
    // through Database.open, not just one produced by this service.
    const encFilePath = path.join(directory, 'external-encrypted.db');
    const encDb = Database.open({ filePath: encFilePath, encryptionKey: ENCRYPTION_KEY });
    encDb.raw.exec('CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT)');
    encDb.raw.prepare("INSERT INTO notes VALUES ('1', 'hello')").run();
    encDb.close();
    expect(readHeader(encFilePath)).not.toBe(PLAINTEXT_HEADER);

    expect(service.validateBackup(encFilePath)).toBe(true);
    const keylessService = new BackupService(db.raw, backupsDir);
    expect(keylessService.validateBackup(encFilePath)).toBe(false);

    const restoreTarget = path.join(directory, 'restored.db');
    restoreBackup(encFilePath, restoreTarget, ENCRYPTION_KEY);
    const restored = Database.open({ filePath: restoreTarget, encryptionKey: ENCRYPTION_KEY });
    const row = restored.raw.prepare("SELECT body FROM notes WHERE id = '1'").get() as {
      body: string;
    };
    restored.close();
    expect(row.body).toBe('hello');
  });

  it('rejects a malformed encryption key at construction, before touching any file', () => {
    expect(() => new BackupService(db.raw, backupsDir, 'not-hex')).toThrow(BackupError);
  });
});
