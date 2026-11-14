import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SchoolAdminRecord } from '@nemis-desktop/types';

const data = vi.hoisted(() => ({
  grades: [] as SchoolAdminRecord[],
  total: 0,
}));

vi.mock('@/services/nemis-bridge/shared', () => ({
  sharedBridge: {
    listSchoolAdminRecords: vi.fn(async ({ limit, offset }: { limit?: number; offset?: number }) => ({
      items: data.grades.slice(offset ?? 0, (offset ?? 0) + (limit ?? data.grades.length)),
      total: data.total,
    })),
  },
}));

import { sharedBridge } from '@/services/nemis-bridge/shared';
import { listGradesForPeriod } from './shared';

const list = () => vi.mocked(sharedBridge.listSchoolAdminRecords);

beforeEach(() => {
  list().mockClear();
});

describe('listGradesForPeriod', () => {
  it('pages past the first 250 rows before filtering by period', async () => {
    data.grades = Array.from({ length: 300 }, (_, i) => ({ id: `g${i}`, gradingPeriodId: i % 2 ? 'p1' : 'p2' }));
    data.total = 300;
    const rows = await listGradesForPeriod('p1');
    expect(rows).toHaveLength(150);
    const offsets = list().mock.calls.map(([r]) => r.offset ?? 0);
    expect(offsets).toEqual([0, 250]);
  });
  it('keeps a row once when a sync insert shifts it onto the next page too', async () => {
    data.grades = Array.from({ length: 300 }, (_, i) => ({ id: `g${i}`, gradingPeriodId: 'p1' }));
    data.total = 300;
    // Page 2 starts one row early, so g249 comes back on both pages.
    list().mockImplementationOnce(async () => ({ items: data.grades.slice(0, 250), total: 300 }));
    list().mockImplementationOnce(async () => ({ items: data.grades.slice(249, 300), total: 300 }));
    const rows = await listGradesForPeriod('p1');
    expect(rows.filter((row) => row.id === 'g249')).toHaveLength(1);
    expect(rows).toHaveLength(300);
    expect(rows.map((row) => row.id)).toEqual(data.grades.map((row) => row.id));
  });
  it('stops after one page when the bridge reports total 0 with items', async () => {
    data.grades = [{ id: 'g1', gradingPeriodId: 'p1' }];
    data.total = 0;
    await expect(listGradesForPeriod('p1')).resolves.toHaveLength(1);
    expect(list()).toHaveBeenCalledTimes(1);
  });
});
