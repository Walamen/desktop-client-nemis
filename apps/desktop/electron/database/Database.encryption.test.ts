import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Database } from './Database';
import { ConnectionError, DatabaseError, IntegrityError } from './errors/errors';

const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);
const PLAINTEXT_HEADER = 'SQLite format 3\u0000';

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

describe('Database encryption', () => {
  let directory: string;
  let filePath: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-enc-test-'));
    filePath = path.join(directory, 'test.db');
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('creates an encrypted database and round-trips data with the same key', () => {
    const db = Database.open({ filePath, encryptionKey: KEY_A });
    expect(db.wasEncryptedInPlace).toBe(false);
    db.raw.exec('CREATE TABLE t (id TEXT PRIMARY KEY)');
    db.raw.prepare('INSERT INTO t (id) VALUES (?)').run('row-1');
    db.close();

    expect(readHeader(filePath)).not.toBe(PLAINTEXT_HEADER);

    const reopened = Database.open({ filePath, encryptionKey: KEY_A });
    const row = reopened.raw.prepare('SELECT id FROM t').get() as { id: string };
    expect(row.id).toBe('row-1');
    reopened.close();
  });

  it('rejects a wrong key and a keyless open of an encrypted file', () => {
    const db = Database.open({ filePath, encryptionKey: KEY_A });
    db.raw.exec('CREATE TABLE t (id TEXT PRIMARY KEY)');
    db.close();

    expect(() => Database.open({ filePath, encryptionKey: KEY_B })).toThrow(IntegrityError);
    expect(() => Database.open({ filePath })).toThrow(DatabaseError);
  });

  it('encrypts an existing plaintext database in place, preserving data', () => {
    const plain = Database.open({ filePath });
    plain.raw.exec('CREATE TABLE t (id TEXT PRIMARY KEY)');
    plain.raw.prepare('INSERT INTO t (id) VALUES (?)').run('kept');
    plain.close();
    expect(readHeader(filePath)).toBe(PLAINTEXT_HEADER);

    const migrated = Database.open({ filePath, encryptionKey: KEY_A });
    expect(migrated.wasEncryptedInPlace).toBe(true);
    const row = migrated.raw.prepare('SELECT id FROM t').get() as { id: string };
    expect(row.id).toBe('kept');
    migrated.close();

    expect(readHeader(filePath)).not.toBe(PLAINTEXT_HEADER);
    expect(() => Database.open({ filePath })).toThrow(DatabaseError);
    const reopened = Database.open({ filePath, encryptionKey: KEY_A });
    expect(reopened.wasEncryptedInPlace).toBe(false);
    reopened.close();
  });

  it('rejects malformed keys before touching the file', () => {
    for (const bad of ['', 'short', 'z'.repeat(64), "x'); PRAGMA evil; --"]) {
      expect(() => Database.open({ filePath, encryptionKey: bad })).toThrow(DatabaseError);
    }
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('keyless open of a fresh file stays plaintext (test-suite compatibility)', () => {
    const db = Database.open({ filePath });
    db.raw.exec('CREATE TABLE t (id TEXT)');
    db.close();
    expect(readHeader(filePath)).toBe(PLAINTEXT_HEADER);
  });

  it('rejects opening a plaintext database read-only with an encryption key (cannot migrate)', () => {
    const plain = Database.open({ filePath });
    plain.raw.exec('CREATE TABLE t (id TEXT)');
    plain.close();
    expect(readHeader(filePath)).toBe(PLAINTEXT_HEADER);

    expect(() => Database.open({ filePath, encryptionKey: KEY_A, readonly: true })).toThrow(
      ConnectionError,
    );
    // Guarded before any pragma touches the file — it is left untouched, still plaintext.
    expect(readHeader(filePath)).toBe(PLAINTEXT_HEADER);
    const reopened = Database.open({ filePath });
    expect(reopened.raw.prepare('SELECT id FROM t').all()).toEqual([]);
    reopened.close();
  });
});
