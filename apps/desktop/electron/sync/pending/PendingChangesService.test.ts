import { describe, expect, it, vi } from 'vitest';
import type { PendingGroupSummary, PendingSource } from '@nemis-desktop/types';
import { logger } from '@app/services/logger';
import { buildGroup } from './groups';
import { PendingChangesService } from './PendingChangesService';
import type { PendingSourceAdapter, RawPendingRow } from './types';
import { NOW, PAST, ctx, memoryDb, queueRow, seedAssignment, seedGradeCompletion } from './pending.test-support';

function fake(source: PendingSource, groups: PendingGroupSummary[], opts: { throws?: boolean; failed?: number; rows?: RawPendingRow[] } = {}): PendingSourceAdapter {
  return {
    source,
    summarize: vi.fn(() => {
      if (opts.throws) throw new Error('boom');
      return groups;
    }),
    listRecords: vi.fn(() => ({ rows: opts.rows ?? [], total: opts.rows?.length ?? 0 })),
    countPending: vi.fn(() => groups.reduce((n, g) => n + g.total, 0)),
    countFailed: vi.fn(() => opts.failed ?? 0),
  };
}

describe('PendingChangesService', () => {
  it('sums sources, sorts groups oldest first and adds failures', () => {
    const service = new PendingChangesService([
      fake('outbox', [buildGroup('outbox', 'students', { waiting: 3 }, NOW)], { failed: 2 }),
      fake('assignments', [buildGroup('assignments', 'assignments', { waiting: 1 }, PAST)]),
    ]);
    const summary = service.getSummary(ctx(memoryDb()));
    expect(summary.groups.map((g) => g.groupKey)).toEqual(['assignments:assignments', 'outbox:students']);
    expect(summary).toMatchObject({ total: 4, failedCount: 2, partial: false });
  });

  it('marks the summary partial when a source throws, keeping the others', () => {
    const logError = vi.spyOn(logger, 'error').mockImplementation(() => {});
    try {
      const service = new PendingChangesService([
        fake('outbox', [], { throws: true }),
        fake('assignments', [buildGroup('assignments', 'assignments', { waiting: 1 }, PAST)]),
      ]);
      const summary = service.getSummary(ctx(memoryDb()));
      expect(summary).toMatchObject({ total: 1, partial: true });
      expect(logError).toHaveBeenCalled();
    } finally {
      logError.mockRestore();
    }
  });

  it('routes records by group key and caps the page size', () => {
    const outbox = fake('outbox', []);
    const service = new PendingChangesService([outbox]);
    service.listRecords(ctx(memoryDb()), { groupKey: 'outbox:attendance', limit: 5000, offset: 10 });
    expect(outbox.listRecords).toHaveBeenCalledWith(expect.anything(), 'attendance', 200, 10);
  });

  it('returns nothing for an unknown group key', () => {
    const service = new PendingChangesService([fake('outbox', [])]);
    expect(service.listRecords(ctx(memoryDb()), { groupKey: 'fee_reversals:fee_payment_reversals', limit: 50, offset: 0 }))
      .toEqual({ records: [], total: 0 });
  });

  it('counts every real source', () => {
    const db = memoryDb();
    queueRow(db, { id: 'q1', seq: 1 });
    queueRow(db, { id: 'q2', seq: 2, status: 'in_flight' });
    seedAssignment(db, 'a1');
    seedGradeCompletion(db, 'gc1');
    expect(new PendingChangesService().countPending(ctx(db))).toBe(4);
  });
});
