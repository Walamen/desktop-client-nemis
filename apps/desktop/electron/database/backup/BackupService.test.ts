import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { BackupError } from '../errors/errors';
import { createTestDatabase, type TestDatabase } from '../testing/createTestDatabase';
import { BackupService, restoreBackup } from './BackupService';

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
