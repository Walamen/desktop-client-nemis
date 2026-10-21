import { describe, expect, it, vi } from 'vitest';
import type { CountyApplicationService } from '@nemis-desktop/application';
import type { CountyAuditLog, CountyAuditPage, CountyAuditQuery } from '@nemis-desktop/types';
import { createTestApplication } from '../../testing/create-test-application';
import { CountyAuditViewModel } from './county-audit-view-model';
import { CountySettingsViewModel } from './county-settings-view-model';

const log = (id: string): CountyAuditLog => ({
  id, action: 'CREATE', actionLabel: 'Created', entityType: 'Student', entityLabel: 'Student',
  actorName: 'James Doe', scope: 'District', timestamp: '2026-10-20T10:00:00.000Z',
});
const page = (ids: string[], total: number, pageNo = 1): CountyAuditPage => ({
  items: ids.map(log), total, page: pageNo, limit: 50,
});

function fakeCounty(list: (query: CountyAuditQuery) => Promise<{ data: CountyAuditPage }>) {
  const county = {
    getAuditStats: vi.fn(async () => ({ data: { total: 2, today: 1, week: 2, actions: [], entityTypes: [] } })),
    listAuditLogs: vi.fn(list),
  };
  return county as typeof county & CountyApplicationService;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('CountyAuditViewModel', () => {
  it('load shows page 1 and the stats', async () => {
    const county = fakeCounty(async () => ({ data: page(['a', 'b'], 2) }));
    const vm = new CountyAuditViewModel({ county });
    await vm.load({ search: '', action: '', entityType: '' });
    expect(vm.store.getState()).toMatchObject({ status: 'ready', total: 2, page: 1, hasMore: false });
    expect(vm.store.getState().items.map((r) => r.id)).toEqual(['a', 'b']);
    expect(vm.store.getState().stats).toMatchObject({ status: 'success', data: { total: 2 } });
  });

  it('sends blank filters as undefined and trims the search', async () => {
    const county = fakeCounty(async () => ({ data: page([], 0) }));
    const vm = new CountyAuditViewModel({ county });
    await vm.load({ search: '  jam ', action: '', entityType: 'Staff' });
    expect(county.listAuditLogs).toHaveBeenLastCalledWith({
      page: 1, limit: 50, search: 'jam', action: undefined, entityType: 'Staff',
    });
  });

  it('load more appends the next page', async () => {
    const county = fakeCounty(async (q) => ({
      data: q.page === 1 ? page(['a'], 2) : page(['b'], 2, 2),
    }));
    const vm = new CountyAuditViewModel({ county });
    await vm.load({ search: '', action: '', entityType: '' });
    expect(vm.store.getState().hasMore).toBe(true);
    await vm.loadMore();
    expect(vm.store.getState().items.map((r) => r.id)).toEqual(['a', 'b']);
    expect(vm.store.getState()).toMatchObject({ page: 2, hasMore: false, loadingMore: false });
  });

  it('drops a load-more response that arrives after the filters changed', async () => {
    const late = deferred<{ data: CountyAuditPage }>();
    const county = fakeCounty(async (q) => {
      if (q.page === 2) return late.promise;
      return { data: q.action === 'DELETE' ? page(['d'], 1) : page(['a'], 2) };
    });
    const vm = new CountyAuditViewModel({ county });
    await vm.load({ search: '', action: '', entityType: '' });
    const more = vm.loadMore();
    await vm.load({ search: '', action: 'DELETE', entityType: '' });
    late.resolve({ data: page(['b'], 2, 2) });
    await more;
    expect(vm.store.getState().items.map((r) => r.id)).toEqual(['d']);
    expect(vm.store.getState()).toMatchObject({ page: 1, total: 1, loadingMore: false });
  });

  it('a failed load says so', async () => {
    const county = fakeCounty(async () => Promise.reject(new Error('locked')));
    const vm = new CountyAuditViewModel({ county });
    await vm.load({ search: '', action: '', entityType: '' });
    expect(vm.store.getState().status).toBe('error');
  });
});

describe('CountySettingsViewModel', () => {
  it('loads the county settings', async () => {
    const { app, ports } = createTestApplication();
    ports.countySettings.settings = {
      county: { id: 'c-1', name: 'Grand Bassa', code: 'GB', isActive: true, createdAt: null, updatedAt: null },
      districtCount: 2,
      schoolCount: 5,
    };
    const vm = new CountySettingsViewModel({ county: app.county });
    await vm.load();
    expect(vm.store.getState().settings).toEqual({ status: 'success', data: ports.countySettings.settings });
  });
});
