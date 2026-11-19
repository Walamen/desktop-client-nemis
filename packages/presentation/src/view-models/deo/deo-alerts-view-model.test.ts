import { describe, expect, it } from 'vitest';
import type { DeoApplicationService } from '@nemis-desktop/application';
import type { DeoAlertListItem, DeoAlertsQuery, DeoAlertsResult } from '@nemis-desktop/types';
import { DeoAlertsViewModel } from './deo-alerts-view-model';

function alert(id: string, isResolved: boolean): DeoAlertListItem {
  return {
    id,
    type: 'ATTENDANCE',
    severity: 'HIGH',
    title: `Alert ${id}`,
    description: 'd',
    institutionId: 's-1',
    schoolName: 'Alpha',
    isResolved,
    resolvedAt: null,
    createdAt: '2026-11-01T00:00:00.000Z',
  };
}

function result(alerts: DeoAlertListItem[], page = 1): DeoAlertsResult {
  return {
    districtId: 'd-1',
    district: { id: 'd-1', name: 'Buchanan' },
    county: { id: 'c-1', name: 'Grand Bassa' },
    alerts,
    meta: { page, limit: 20, total: alerts.length, totalPages: 1 },
  };
}

function makeDeo(opts: {
  list?: (q: DeoAlertsQuery) => DeoAlertsResult;
  resolve?: (id: string) => Promise<boolean>;
}) {
  const queries: DeoAlertsQuery[] = [];
  const resolved: string[] = [];
  const deo = {
    listAlerts: async (q: DeoAlertsQuery) => {
      queries.push({ ...q });
      return { data: (opts.list ?? (() => result([alert('a-1', false)], q.page)))(q) };
    },
    resolveAlert: async (id: string) => {
      resolved.push(id);
      return { data: await (opts.resolve ?? (async () => true))(id) };
    },
  } as unknown as DeoApplicationService;
  return { deo, queries, resolved };
}

describe('DeoAlertsViewModel', () => {
  it('starts on open, page 1, and loads with the current filter and page', async () => {
    const { deo, queries } = makeDeo({});
    const vm = new DeoAlertsViewModel({ deo });
    expect(vm.store.getState()).toMatchObject({ filter: 'open', page: 1, resolvingAlertId: null, failedAlertId: null });
    expect(vm.store.getState().alerts.status).toBe('idle');
    await vm.load();
    expect(queries).toEqual([{ filter: 'open', page: 1 }]);
    expect(vm.store.getState().alerts.status).toBe('success');
  });

  it('setPage stores the page then loads it', async () => {
    const { deo, queries } = makeDeo({});
    const vm = new DeoAlertsViewModel({ deo });
    await vm.setPage(3);
    expect(vm.store.getState().page).toBe(3);
    expect(queries).toEqual([{ filter: 'open', page: 3 }]);
  });

  it('setFilter resets the page to 1 and loads', async () => {
    const { deo, queries } = makeDeo({});
    const vm = new DeoAlertsViewModel({ deo });
    await vm.setPage(4);
    await vm.setFilter('resolved');
    expect(vm.store.getState()).toMatchObject({ filter: 'resolved', page: 1 });
    expect(queries[queries.length - 1]).toEqual({ filter: 'resolved', page: 1 });
  });

  it('stores the result page when the server clamps a past-the-end page', async () => {
    const { deo } = makeDeo({ list: (q) => result([alert('a-1', false)], q.page > 2 ? 2 : q.page) });
    const vm = new DeoAlertsViewModel({ deo });
    await vm.setPage(9);
    expect(vm.store.getState().page).toBe(2);
  });

  it('resolves an alert then reloads', async () => {
    const { deo, queries, resolved } = makeDeo({});
    const vm = new DeoAlertsViewModel({ deo });
    await vm.load();
    const p = vm.resolve('a-1');
    expect(vm.store.getState().resolvingAlertId).toBe('a-1');
    await p;
    expect(resolved).toEqual(['a-1']);
    expect(queries).toHaveLength(2);
    expect(vm.store.getState()).toMatchObject({ resolvingAlertId: null, failedAlertId: null });
  });

  it('ignores a second resolve while one is running', async () => {
    const { deo, resolved } = makeDeo({});
    const vm = new DeoAlertsViewModel({ deo });
    await Promise.all([vm.resolve('a-1'), vm.resolve('a-2')]);
    expect(resolved).toEqual(['a-1']);
  });

  it('sets failedAlertId when resolving rejects', async () => {
    const { deo } = makeDeo({
      resolve: async () => {
        throw new Error('disk full');
      },
    });
    const vm = new DeoAlertsViewModel({ deo });
    await vm.resolve('a-1');
    expect(vm.store.getState()).toMatchObject({ failedAlertId: 'a-1', resolvingAlertId: null });
  });

  it('clears failedAlertId when false was returned but the reload no longer lists it open', async () => {
    const { deo } = makeDeo({ resolve: async () => false, list: () => result([]) });
    const vm = new DeoAlertsViewModel({ deo });
    await vm.resolve('a-1');
    expect(vm.store.getState().failedAlertId).toBeNull();
  });

  it('sets failedAlertId when false was returned and the alert is still open', async () => {
    const { deo } = makeDeo({ resolve: async () => false, list: () => result([alert('a-1', false)]) });
    const vm = new DeoAlertsViewModel({ deo });
    await vm.resolve('a-1');
    expect(vm.store.getState().failedAlertId).toBe('a-1');
  });

  it('clears an earlier failure on the next attempt', async () => {
    let fail = true;
    const { deo } = makeDeo({
      resolve: async () => {
        if (fail) throw new Error('x');
        return true;
      },
    });
    const vm = new DeoAlertsViewModel({ deo });
    await vm.resolve('a-1');
    fail = false;
    await vm.resolve('a-1');
    expect(vm.store.getState().failedAlertId).toBeNull();
  });
});
