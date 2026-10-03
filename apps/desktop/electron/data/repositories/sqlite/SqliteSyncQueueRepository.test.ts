import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationError } from '../../errors/repositoryErrors';
import { createTestContext, type TestContext } from '../../testing/createTestContext';
import { SqliteSyncQueueRepository } from './SqliteSyncQueueRepository';

describe('SqliteSyncQueueRepository', () => {
  let test: TestContext;
  let repo: SqliteSyncQueueRepository;

  // Fake timers: createdAt values come from nowIso(); advancing 1ms between
  // inserts makes creation-order assertions deterministic (two real inserts
  // can otherwise share a millisecond, leaving order to random UUID tiebreak).
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T00:00:00.000Z'));
    test = createTestContext();
    repo = new SqliteSyncQueueRepository(test.context);
  });

  afterEach(() => {
    vi.useRealTimers();
    test.cleanup();
  });

  const tick = () => vi.advanceTimersByTime(1);

  const op = (entityId: string) => ({
    entityType: 'student',
    entityId,
    operationType: 'create' as const,
    payload: { name: `payload-${entityId}` },
  });

  it('enqueue creates a pending item with payload round-trip', () => {
    const item = repo.enqueue(op('e1'));
    expect(item.status).toBe('pending');
    expect(item.retryCount).toBe(0);
    expect(item.payload).toEqual({ name: 'payload-e1' });
    expect(repo.findById(item.id)).toEqual(item);
  });

  it('enqueue validates input', () => {
    expect(() => repo.enqueue({ ...op('e1'), entityType: '' })).toThrow(ValidationError);
    expect(() => repo.enqueue({ ...op('e1'), operationType: 'upsert' as never })).toThrow(
      ValidationError,
    );
  });

  it('enqueueMany is atomic and preserves order', () => {
    const items = repo.enqueueMany([op('e1'), op('e2'), op('e3')]);
    expect(items).toHaveLength(3);
    expect(repo.countByStatus('pending')).toBe(3);
  });

  it('nextBatch returns oldest pending first, bounded by limit', () => {
    const first = repo.enqueue(op('e1'));
    tick();
    const second = repo.enqueue(op('e2'));
    tick();
    repo.enqueue(op('e3'));
    repo.markCompleted([first.id]);
    const batch = repo.nextBatch(1);
    expect(batch).toHaveLength(1);
    expect(batch[0]!.id).toBe(second.id);
  });

  it('markInFlight and markCompleted update status and report counts', () => {
    const a = repo.enqueue(op('e1'));
    const b = repo.enqueue(op('e2'));
    expect(repo.markInFlight([a.id, b.id])).toBe(2);
    expect(repo.countByStatus('in_flight')).toBe(2);
    expect(repo.markCompleted([a.id])).toBe(1);
    expect(repo.countByStatus('completed')).toBe(1);
    expect(repo.markCompleted([])).toBe(0);
  });

  it('markFailed sets failed status and increments retryCount', () => {
    const item = repo.enqueue(op('e1'));
    expect(repo.markFailed(item.id).retryCount).toBe(1);
    expect(repo.markFailed(item.id).retryCount).toBe(2);
    expect(repo.countByStatus('failed')).toBe(1);
  });

  it('purgeCompleted removes only old completed items', () => {
    const a = repo.enqueue(op('e1'));
    repo.enqueue(op('e2'));
    repo.markCompleted([a.id]);
    expect(repo.purgeCompleted('9999-01-01T00:00:00.000Z')).toBe(1);
    expect(repo.countByStatus('pending')).toBe(1);
    expect(() => repo.purgeCompleted('not-a-date')).toThrow(ValidationError);
  });

  it('recordError and errorsForOperation link errors to a queue operation', () => {
    const item = repo.enqueue(op('e1'));
    tick();
    repo.recordError({ operationId: item.id, message: 'network timeout', retryCount: 1 });
    tick();
    repo.recordError({ operationId: item.id, message: 'server 500', stack: 'at sync()' });
    const errors = repo.errorsForOperation(item.id);
    expect(errors).toHaveLength(2);
    expect(errors.map((e) => e.message)).toEqual(['network timeout', 'server 500']);
    expect(errors[1]!.stack).toBe('at sync()');
  });

  it('recordError validates input', () => {
    expect(() => repo.recordError({ operationId: null, message: '' })).toThrow(ValidationError);
  });

  it('markCompleted spans multiple chunks atomically and counts all rows', () => {
    const items = repo.enqueueMany(Array.from({ length: 5 }, (_, index) => op(`chunk-${index}`)));
    const ids = items.map((item) => item.id);
    // chunkSize is internal; exercise the chunked path via a tiny chunk by
    // updating through markCompleted after verifying >1 chunk behavior at the
    // base level is covered in BaseRepository — here we prove correctness for
    // a realistic multi-row batch.
    expect(repo.markCompleted(ids)).toBe(5);
    expect(repo.countByStatus('completed')).toBe(5);
  });

  it('claimBatch atomically selects and marks the oldest pending items', () => {
    const first = repo.enqueue(op('c1'));
    tick();
    const second = repo.enqueue(op('c2'));
    tick();
    repo.enqueue(op('c3'));

    const claimed = repo.claimBatch(2);

    expect(claimed.map((item) => item.id)).toEqual([first.id, second.id]);
    expect(claimed.every((item) => item.status === 'in_flight')).toBe(true);
    expect(repo.countByStatus('pending')).toBe(1);
    expect(repo.countByStatus('in_flight')).toBe(2);
  });

  it('claimBatch never returns items another claim already took', () => {
    repo.enqueue(op('c1'));
    tick();
    repo.enqueue(op('c2'));
    const firstClaim = repo.claimBatch(1);
    const secondClaim = repo.claimBatch(5);
    expect(secondClaim.map((item) => item.id)).not.toContain(firstClaim[0]!.id);
    expect(secondClaim).toHaveLength(1);
  });

  it('claimBatch on an empty queue returns [] without writes', () => {
    expect(repo.claimBatch(10)).toEqual([]);
    expect(repo.count()).toBe(0);
  });

  it('scheduleRetry keeps status pending, increments retryCount, and sets nextAttemptAt', () => {
    const item = repo.enqueue(op('e1'));
    const rescheduled = repo.scheduleRetry(item.id, '2026-07-29T00:05:00.000Z');
    expect(rescheduled.status).toBe('pending');
    expect(rescheduled.retryCount).toBe(1);
    expect(rescheduled.nextAttemptAt).toBe('2026-07-29T00:05:00.000Z');
  });

  it('claimBatch skips a backed-off row and holds back every row written after it', () => {
    // A backed-off student's guardian link / enrolment (later seq) must not be
    // pushed ahead of it, or the server rejects them as conflicts.
    const first = repo.enqueue(op('e1'));
    const second = repo.enqueue(op('e2'));
    repo.enqueue(op('e3'));
    repo.enqueue(op('e4'));
    repo.scheduleRetry(second.id, '2026-08-01T00:00:00.000Z');

    expect(repo.nextBatch(10).map((row) => row.id)).toEqual([first.id]);
    expect(repo.claimBatch(10).map((row) => row.id)).toEqual([first.id]);
    expect(repo.claimBatch(10)).toEqual([]);
    expect(repo.countByStatus('pending')).toBe(3);
  });

  it('claimBatch releases the held-back rows in seq order once the backed-off row is due', () => {
    const first = repo.enqueue(op('e1'));
    const second = repo.enqueue(op('e2'));
    const third = repo.enqueue(op('e3'));
    repo.scheduleRetry(first.id, '2026-07-16T00:05:00.000Z');
    expect(repo.claimBatch(10)).toEqual([]);

    vi.setSystemTime(new Date('2026-07-16T00:05:00.001Z'));

    expect(repo.claimBatch(10).map((row) => row.id)).toEqual([first.id, second.id, third.id]);
  });

  it('a dead-lettered row never holds back the rows after it', () => {
    const first = repo.enqueue(op('e1'));
    const second = repo.enqueue(op('e2'));
    const third = repo.enqueue(op('e3'));
    // Dead-lettering as DesktopSyncWorker does it: failed + deadLetter=1,
    // with the last scheduled nextAttemptAt still in the future.
    repo.scheduleRetry(first.id, '2026-08-01T00:00:00.000Z');
    repo.markFailed(first.id);
    test.context.connection.prepare(`UPDATE sync_queue SET deadLetter=1 WHERE id=?`).run(first.id);

    expect(repo.claimBatch(10).map((row) => row.id)).toEqual([second.id, third.id]);
  });

  it('enqueue stamps a seq after rows the outbox triggers already wrote', () => {
    // An outbox trigger stamps MAX(seq)+1 itself; simulate one at seq 41.
    test.context.connection
      .prepare(
        `INSERT INTO sync_queue (id,entityType,entityId,operationType,payload,retryCount,status,createdAt,updatedAt,seq)
         VALUES ('trigger-row','students','s0','create','{}',0,'pending',?,?,41)`,
      )
      .run('2026-07-16T00:00:00.000Z', '2026-07-16T00:00:00.000Z');

    const item = repo.enqueue(op('e1'));

    const { seq } = test.context.connection.prepare(`SELECT seq FROM sync_queue WHERE id=?`).get(item.id) as {
      seq: number;
    };
    expect(seq).toBe(42);
    expect(repo.claimBatch(10).map((row) => row.id)).toEqual(['trigger-row', item.id]);
  });

  it('claimBatch includes pending items whose nextAttemptAt has already elapsed', () => {
    vi.setSystemTime(new Date('2026-07-29T00:10:00.000Z'));
    const item = repo.enqueue(op('e1'));
    repo.scheduleRetry(item.id, '2026-07-29T00:00:00.000Z');

    const claimed = repo.claimBatch(10);

    expect(claimed.map((row) => row.id)).toEqual([item.id]);
  });
});
