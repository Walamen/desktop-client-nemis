import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Database } from './Database';
import { IntegrityError } from './errors/errors';
import { createTestDatabase } from './testing/createTestDatabase';

describe('Database', () => {
  it('opens with WAL mode, foreign keys, and configured pragmas', () => {
    const { db, cleanup } = createTestDatabase();
    try {
      expect(db.isOpen).toBe(true);
      expect(db.raw.pragma('journal_mode', { simple: true })).toBe('wal');
      expect(db.raw.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(db.raw.pragma('synchronous', { simple: true })).toBe(1); // NORMAL
      expect(db.raw.pragma('busy_timeout', { simple: true })).toBe(5000);
      expect(db.raw.pragma('temp_store', { simple: true })).toBe(2); // MEMORY
    } finally {
      cleanup();
    }
  });

  it('creates the parent directory and database file when missing', () => {
    const { filePath, cleanup } = createTestDatabase();
    try {
      expect(fs.existsSync(filePath)).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('close() is idempotent and flips isOpen', () => {
    const { db, cleanup } = createTestDatabase();
    db.close();
    expect(db.isOpen).toBe(false);
    db.close(); // second call must not throw
    cleanup();
  });

  it('rejects a file that is not a SQLite database', () => {
    const { filePath, cleanup, db } = createTestDatabase();
    db.close();
    fs.writeFileSync(filePath, 'this is not a database');
    expect(() => Database.open({ filePath })).toThrow(IntegrityError);
    cleanup();
  });
});
