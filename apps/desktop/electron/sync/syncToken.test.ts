import Database from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrations } from '@app/database/migrations/registry';
import { rebaseQueued, tokenFromRemote, writeBackToken } from './syncToken';

function db(): SqliteDatabase {
  const connection = new Database(':memory:');
  connection.pragma('foreign_keys = OFF');
  for (const migration of migrations) migration.up(connection);
  return connection;
}

describe('tokenFromRemote', () => {
  it('uses createdAt for rows that only have createdAt (student_guardians)', () => {
    expect(
      tokenFromRemote({ createdAt: '2026-01-01T00:00:00.000Z' }, { createdAt: '2026-01-02T00:00:00Z' }),
    ).toEqual({ field: 'createdAt', value: '2026-01-02T00:00:00.000Z' });
  });

  it('uses assignedAt when updatedAt is missing on one side', () => {
    expect(
      tokenFromRemote(
        { assignedAt: '2026-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z' },
        { assignedAt: new Date('2026-01-03T00:00:00.000Z'), createdAt: '2026-01-01T00:00:00.000Z' },
      ),
    ).toEqual({ field: 'assignedAt', value: '2026-01-03T00:00:00.000Z' });
  });

  it('prefers updatedAt and returns the remote value', () => {
    expect(
      tokenFromRemote(
        { updatedAt: '2026-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z' },
        { updatedAt: '2026-02-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z' },
      ),
    ).toEqual({ field: 'updatedAt', value: '2026-02-01T00:00:00.000Z' });
  });

  it('skips unparseable values and returns null when nothing qualifies', () => {
    expect(tokenFromRemote({ updatedAt: 'nope', createdAt: '2026-01-01T00:00:00Z' }, { updatedAt: 'x', createdAt: '2026-01-05T00:00:00Z' }))
      .toEqual({ field: 'createdAt', value: '2026-01-05T00:00:00.000Z' });
    expect(tokenFromRemote({ name: 'a' }, { name: 'b' })).toBeNull();
    expect(tokenFromRemote({ updatedAt: 1 }, { updatedAt: 2 })).toBeNull();
  });
});

describe('rebaseQueued', () => {
  let connection: SqliteDatabase;
  beforeEach(() => {
    connection = db();
  });
  function queue(id: string, entityId: string, status: string, payload: unknown, nextAttemptAt: string | null = null, entityType = 'terms') {
    const now = new Date().toISOString();
    connection
      .prepare(
        `INSERT INTO sync_queue (id,entityType,entityId,operationType,payload,retryCount,status,createdAt,updatedAt,nextAttemptAt)
         VALUES (?,?,?,'update',?,0,?,?,?,?)`,
      )
      .run(id, entityType, entityId, JSON.stringify(payload), status, now, now, nextAttemptAt);
  }
  const payloadOf = (id: string) =>
    JSON.parse((connection.prepare(`SELECT payload FROM sync_queue WHERE id=?`).get(id) as { payload: string }).payload);

  it('rewrites only the named base field on pending rows of that record', () => {
    const base = { updatedAt: 'old', name: 'x' };
    queue('a', 't1', 'pending', { base, record: { updatedAt: 'r' } });
    queue('b', 't1', 'pending', { base, record: {} }, '2099-01-01T00:00:00.000Z');
    queue('c', 't1', 'in_flight', { base, record: {} });
    queue('d', 't2', 'pending', { base, record: {} });
    queue('e', 't1', 'pending', { record: { name: 'new' } });
    queue('f', 't1', 'pending', { base, record: {} }, null, 'attendance');

    const n = rebaseQueued(connection, 'terms', 't1', { field: 'updatedAt', value: '2026-02-01T00:00:00.000Z' });

    expect(n).toBe(2);
    expect(payloadOf('a')).toEqual({ base: { updatedAt: '2026-02-01T00:00:00.000Z', name: 'x' }, record: { updatedAt: 'r' } });
    expect(payloadOf('b').base.updatedAt).toBe('2026-02-01T00:00:00.000Z');
    expect(payloadOf('c').base.updatedAt).toBe('old');
    expect(payloadOf('d').base.updatedAt).toBe('old');
    expect(payloadOf('e')).toEqual({ record: { name: 'new' } });
    expect(payloadOf('f').base.updatedAt).toBe('old');
  });
});

describe('writeBackToken', () => {
  let connection: SqliteDatabase;
  beforeEach(() => {
    connection = db();
    connection
      .prepare(
        `INSERT INTO terms (id,academicYearId,name,startDate,endDate,isCurrent,version,updatedAt)
         VALUES ('t1','y1','T1','2026-01-01','2026-03-01',0,1,'2026-01-01T00:00:00.000Z')`,
      )
      .run();
    connection.prepare(`DELETE FROM sync_queue`).run();
  });
  const captured = () => (connection.prepare(`SELECT COUNT(*) c FROM sync_queue`).get() as { c: number }).c;
  const updatedAt = () => (connection.prepare(`SELECT updatedAt FROM terms WHERE id='t1'`).get() as { updatedAt: string }).updatedAt;
  const capture = () => (connection.prepare(`SELECT captureEnabled c FROM sync_runtime WHERE id='singleton'`).get() as { c: number }).c;

  it('updates the column without enqueueing and restores capture', () => {
    writeBackToken(connection, 'terms', 't1', { field: 'updatedAt', value: '2026-02-01T00:00:00.000Z' });
    expect(updatedAt()).toBe('2026-02-01T00:00:00.000Z');
    expect(captured()).toBe(0);
    expect(capture()).toBe(1);
  });

  it('does nothing for non-queue-backed tables, unknown tables or missing columns', () => {
    writeBackToken(connection, 'sync_queue', 't1', { field: 'updatedAt', value: '2026-02-01T00:00:00.000Z' });
    writeBackToken(connection, 'nope; DROP TABLE terms', 't1', { field: 'updatedAt', value: '2026-02-01T00:00:00.000Z' });
    writeBackToken(connection, 'terms', 't1', { field: 'assignedAt', value: '2026-02-01T00:00:00.000Z' });
    expect(updatedAt()).toBe('2026-01-01T00:00:00.000Z');
    expect(captured()).toBe(0);
    expect(capture()).toBe(1);
  });
});
