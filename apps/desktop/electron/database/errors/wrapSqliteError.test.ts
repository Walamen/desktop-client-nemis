import { describe, expect, it } from 'vitest';
import {
  ConnectionError,
  ConstraintError,
  DatabaseError,
  IntegrityError,
  MigrationError,
} from './errors';
import { wrapSqliteError } from './wrapSqliteError';

function sqliteError(code: string, message = 'raw sqlite detail'): Error {
  const error = new Error(message);
  (error as Error & { code: string }).code = code;
  return error;
}

describe('wrapSqliteError', () => {
  it('passes through DatabaseError instances unchanged', () => {
    const original = new MigrationError('migration 3 failed');
    expect(wrapSqliteError(original, 'ctx')).toBe(original);
  });

  it('maps constraint violations to ConstraintError', () => {
    const wrapped = wrapSqliteError(sqliteError('SQLITE_CONSTRAINT_FOREIGNKEY'), 'insert device');
    expect(wrapped).toBeInstanceOf(ConstraintError);
    expect(wrapped.code).toBe('DB_CONSTRAINT');
  });

  it('maps busy/locked to ConnectionError and corruption to IntegrityError', () => {
    expect(wrapSqliteError(sqliteError('SQLITE_BUSY'), 'open')).toBeInstanceOf(ConnectionError);
    expect(wrapSqliteError(sqliteError('SQLITE_CORRUPT'), 'open')).toBeInstanceOf(IntegrityError);
    expect(wrapSqliteError(sqliteError('SQLITE_NOTADB'), 'open')).toBeInstanceOf(IntegrityError);
  });

  it('never leaks the raw SQLite message; keeps it as cause', () => {
    const raw = sqliteError('SQLITE_CONSTRAINT_UNIQUE', 'UNIQUE constraint failed: devices.id');
    const wrapped = wrapSqliteError(raw, 'insert device');
    expect(wrapped.message).not.toContain('devices.id');
    expect(wrapped.message).toContain('insert device');
    expect(wrapped.cause).toBe(raw);
  });

  it('wraps unknown values in a generic DatabaseError', () => {
    const wrapped = wrapSqliteError('boom', 'somewhere');
    expect(wrapped).toBeInstanceOf(DatabaseError);
    expect(wrapped.code).toBe('DB_UNKNOWN');
  });
});
