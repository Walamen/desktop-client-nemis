import Database from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrations } from '@app/database/migrations/registry';
import { foldPendingFollowers } from './foldConflict';

function db(): SqliteDatabase {
  const connection = new Database(':memory:');
  connection.pragma('foreign_keys = OFF');
  for (const migration of migrations) migration.up(connection);
  return connection;
}

describe('foldPendingFollowers', () => {
  let connection: SqliteDatabase;
  let seq = 0;
  beforeEach(() => {
    connection = db();
    seq = 0;
  });

  function queue(
    id: string,
    operationType: 'create' | 'update' | 'delete',
    payload: unknown,
    options: { status?: string; entityId?: string; entityType?: string; nextAttemptAt?: string | null } = {},
  ): void {
    seq += 1;
    const now = '2026-11-05T09:00:00.000Z';
    connection
      .prepare(
        `INSERT INTO sync_queue (id,entityType,entityId,operationType,payload,retryCount,status,createdAt,updatedAt,nextAttemptAt,seq)
         VALUES (?,?,?,?,?,0,?,?,?,?,?)`,
      )
      .run(
        id,
        options.entityType ?? 'terms',
        options.entityId ?? 't1',
        operationType,
        JSON.stringify(payload),
        options.status ?? 'pending',
        now,
        now,
        options.nextAttemptAt ?? null,
        seq,
      );
  }
  const ids = () => (connection.prepare(`SELECT id FROM sync_queue ORDER BY seq`).all() as { id: string }[]).map((row) => row.id);

  const base = { id: 't1', name: 'T1', updatedAt: '2026-11-01T00:00:00.000Z' };

  it('update + update: keeps the refused base, takes the latest record, removes the follower', () => {
    const refused = { base, record: { id: 't1', name: 'B' } };
    queue('refused', 'update', refused, { status: 'in_flight' });
    queue('f1', 'update', { base: { ...base, name: 'B' }, record: { id: 't1', name: 'C' } }, { nextAttemptAt: '2099-01-01T00:00:00.000Z' });

    const folded = foldPendingFollowers(connection, { entityType: 'terms', entityId: 't1', operationType: 'update', payload: refused });

    expect(folded).toEqual({ operationType: 'update', payload: { base, record: { id: 't1', name: 'C' } } });
    expect(ids()).toEqual(['refused']);
  });

  it('update + delete: becomes a delete with the refused base and no record', () => {
    const refused = { base, record: { id: 't1', name: 'B' } };
    queue('refused', 'update', refused, { status: 'in_flight' });
    queue('f1', 'update', { base, record: { id: 't1', name: 'C' } });
    queue('f2', 'delete', { base: { ...base, name: 'C' } });

    const folded = foldPendingFollowers(connection, { entityType: 'terms', entityId: 't1', operationType: 'update', payload: refused });

    expect(folded).toEqual({ operationType: 'delete', payload: { base } });
    expect(ids()).toEqual(['refused']);
  });

  it('create + update: stays a create carrying the latest record', () => {
    const refused = { record: { id: 't1', name: 'A' } };
    queue('refused', 'create', refused, { status: 'in_flight' });
    queue('f1', 'update', { base: { id: 't1', name: 'A' }, record: { id: 't1', name: 'B' } });

    const folded = foldPendingFollowers(connection, { entityType: 'terms', entityId: 't1', operationType: 'create', payload: refused });

    expect(folded).toEqual({ operationType: 'create', payload: { record: { id: 't1', name: 'B' } } });
    expect(ids()).toEqual(['refused']);
  });

  it('no followers: returns the refused change unchanged and touches nothing else', () => {
    const refused = { base, record: { id: 't1', name: 'B' } };
    queue('refused', 'update', refused, { status: 'in_flight' });
    queue('other-record', 'update', { base, record: {} }, { entityId: 't2' });
    queue('other-table', 'update', { base, record: {} }, { entityType: 'classes' });
    queue('dead', 'update', { base, record: {} }, { status: 'failed' });
    queue('done', 'update', { base, record: {} }, { status: 'completed' });

    const folded = foldPendingFollowers(connection, { entityType: 'terms', entityId: 't1', operationType: 'update', payload: refused });

    expect(folded).toEqual({ operationType: 'update', payload: refused });
    expect(ids()).toEqual(['refused', 'other-record', 'other-table', 'dead', 'done']);
  });
});
