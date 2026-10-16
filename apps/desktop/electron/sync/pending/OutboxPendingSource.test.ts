import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DatabaseManager } from '@app/database/DatabaseManager';
import { createDataLayer } from '@app/data/factories/createDataLayer';
import { OutboxPendingSource } from './OutboxPendingSource';
import { FUTURE, NOW, PAST, ctx, memoryDb, queueRow } from './pending.test-support';

const source = new OutboxPendingSource();

describe('OutboxPendingSource', () => {
  it('classifies sending, waiting, retrying and held', () => {
    const db = memoryDb();
    queueRow(db, { id: 'a', seq: 1, status: 'in_flight' });
    queueRow(db, { id: 'b', seq: 2 });
    queueRow(db, { id: 'c', seq: 3, nextAttemptAt: FUTURE, retryCount: 1 });
    queueRow(db, { id: 'd', seq: 4 });
    queueRow(db, { id: 'e', seq: 5, nextAttemptAt: PAST });

    const [group] = source.summarize(ctx(db));
    expect(group).toMatchObject({
      groupKey: 'outbox:students',
      label: 'Students',
      total: 5,
      byState: { sending: 1, waiting: 1, retrying: 1, held: 2 },
      oldestAt: PAST,
    });
    const { rows } = source.listRecords(ctx(db), 'students', 50, 0);
    expect(rows.map((row) => [row.id, row.state])).toEqual([
      ['a', 'sending'], ['b', 'waiting'], ['c', 'retrying'], ['d', 'held'], ['e', 'held'],
    ]);
  });

  it('excludes completed rows and dead letters, and counts dead letters as failed', () => {
    const db = memoryDb();
    queueRow(db, { id: 'done', seq: 1, status: 'completed' });
    queueRow(db, { id: 'dead', seq: 2, status: 'failed', deadLetter: 1 });
    queueRow(db, { id: 'live', seq: 3 });
    expect(source.countPending(ctx(db))).toBe(1);
    expect(source.countFailed(ctx(db))).toBe(1);
    expect(source.summarize(ctx(db))[0]?.total).toBe(1);
  });

  it('groups by entity type and reports the latest error', () => {
    const db = memoryDb();
    queueRow(db, { id: 'att', seq: 1, entityType: 'attendance', nextAttemptAt: FUTURE, retryCount: 2 });
    queueRow(db, { id: 'stu', seq: 2, entityType: 'students' });
    db.prepare(`INSERT INTO sync_errors (id,operationId,message,retryCount,createdAt) VALUES ('e1','att','old',1,?),('e2','att','Server said no',2,?)`).run(PAST, NOW);

    expect(source.summarize(ctx(db)).map((g) => g.groupKey).sort()).toEqual(['outbox:attendance', 'outbox:students']);
    const [row] = source.listRecords(ctx(db), 'attendance', 50, 0).rows;
    expect(row).toMatchObject({ id: 'att', entityType: 'attendance', retryCount: 2, lastError: 'Server said no', nextAttemptAt: FUTURE });
  });

  it('pages a large group with an exact total', () => {
    const db = memoryDb();
    for (let i = 1; i <= 500; i += 1) queueRow(db, { id: `q${i}`, seq: i, entityType: 'attendance' });
    expect(source.summarize(ctx(db))[0]?.total).toBe(500);
    const page = source.listRecords(ctx(db), 'attendance', 50, 100);
    expect(page.total).toBe(500);
    expect(page.rows).toHaveLength(50);
    expect(page.rows[0]?.id).toBe('q101');
  });

  it('survives a NULL or malformed payload', () => {
    const db = memoryDb();
    queueRow(db, { id: 'n', seq: 1, payload: null });
    queueRow(db, { id: 'm', seq: 2, payload: '{not json' });
    const { rows } = source.listRecords(ctx(db), 'students', 50, 0);
    expect(rows.map((row) => row.payload)).toEqual([null, '{not json']);
  });

  it('labels exactly the rows nextBatch would claim as waiting', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-pending-parity-'));
    const manager = new DatabaseManager({
      userDataDir: directory,
      device: { deviceName: 'parity', platform: 'win32', osVersion: '10.0', appVersion: '1.0.0' },
    });
    try {
      manager.initialize();
      const data = createDataLayer(manager, { info: () => {}, warn: () => {}, error: () => {} });
      const db = manager.connection;
      const future = new Date(Date.now() + 10 * 60_000).toISOString();
      const past = new Date(Date.now() - 10 * 60_000).toISOString();
      queueRow(db, { id: 'w1', seq: 1 });
      queueRow(db, { id: 'w2', seq: 2, nextAttemptAt: past });
      queueRow(db, { id: 'r1', seq: 3, nextAttemptAt: future });
      queueRow(db, { id: 'h1', seq: 4 });
      queueRow(db, { id: 'f1', seq: 5, status: 'in_flight' });
      queueRow(db, { id: 'x1', seq: 6, status: 'failed', deadLetter: 1 });

      const claimable = data.repositories.syncQueue.nextBatch(10_000).map((item) => item.id).sort();
      const waiting = source
        .listRecords({ db, institutionId: 'school-1', now: new Date().toISOString() }, 'students', 200, 0)
        .rows.filter((row) => row.state === 'waiting')
        .map((row) => row.id)
        .sort();
      expect(waiting).toEqual(claimable);
      expect(waiting).toEqual(['w1', 'w2']);
    } finally {
      manager.shutdown();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
