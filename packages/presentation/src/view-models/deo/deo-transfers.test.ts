import { describe, expect, it } from 'vitest';
import type { DeoApplicationService } from '@nemis-desktop/application';
import { createTestApplication } from '../../testing/create-test-application';
import { DeoTransfersViewModel } from './deo-transfers-view-model';
import {
  DIRECTION_TABS,
  TRANSFER_STATUS_TABS,
  directionLabel,
  filterTransfers,
  transferTabCounts,
  waitingLabel,
} from './deo-transfers-views';

describe('DEO Transfers helpers (same rules as portal-web lib/deo-dashboard.ts)', () => {
  const tr = (id: string, status: string, direction: string, lapsed = false) => ({ id, status, direction, lapsed });
  const items = [
    tr('p-in', 'PENDING', 'INTO'),
    tr('l-within', 'PENDING', 'WITHIN', true),
    tr('a-out', 'APPROVED', 'OUT_OF'),
    tr('r-within', 'REJECTED', 'WITHIN'),
    tr('c-in', 'CANCELLED', 'INTO'),
  ];

  it('files a lapsed request under Lapsed, never Pending or Approved', () => {
    expect(TRANSFER_STATUS_TABS).toEqual(['All', 'Pending', 'Lapsed', 'Approved', 'Rejected', 'Cancelled']);
    expect(filterTransfers(items, 'Pending', 'All').map((t) => t.id)).toEqual(['p-in']);
    expect(filterTransfers(items, 'Lapsed', 'All').map((t) => t.id)).toEqual(['l-within']);
    expect(filterTransfers(items, 'Approved', 'All').map((t) => t.id)).toEqual(['a-out']);
  });

  it('filters by direction and counts status tabs within it', () => {
    expect(DIRECTION_TABS).toEqual(['All', 'Into district', 'Out of district', 'Within district']);
    expect(filterTransfers(items, 'All', 'Within district').map((t) => t.id)).toEqual(['l-within', 'r-within']);
    expect(transferTabCounts(items, 'Into district')).toEqual({
      All: 2,
      Pending: 1,
      Lapsed: 0,
      Approved: 0,
      Rejected: 0,
      Cancelled: 1,
    });
  });

  it('words the direction and the wait in calendar days', () => {
    expect(directionLabel('INTO')).toBe('Into district');
    expect(directionLabel('OUT_OF')).toBe('Out of district');
    expect(directionLabel('WITHIN')).toBe('Within district');
    const now = new Date(2026, 10, 17, 8, 0);
    expect(waitingLabel(new Date(2026, 10, 17, 1, 0).toISOString(), now)).toBe('today');
    expect(waitingLabel(new Date(2026, 10, 16, 23, 0).toISOString(), now)).toBe('1 day');
    expect(waitingLabel(new Date(2026, 10, 8, 12, 0).toISOString(), now)).toBe('9 days');
  });
});

describe('DeoTransfersViewModel', () => {
  it('loads the transfers of the signed-in officer', async () => {
    const { app } = createTestApplication();
    const vm = new DeoTransfersViewModel({ deo: app.deo });
    const loading = vm.load();
    expect(vm.store.getState().transfers.status).toBe('loading');
    await loading;
    expect(vm.store.getState().transfers.status).toBe('success');
  });

  it('moves to error when the service fails', async () => {
    const failing = {
      listTransfers: async () => {
        throw new Error('database locked');
      },
    } as unknown as DeoApplicationService;
    const vm = new DeoTransfersViewModel({ deo: failing });
    await vm.load();
    expect(vm.store.getState().transfers.status).toBe('error');
  });
});
