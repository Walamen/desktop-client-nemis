import { describe, expect, it } from 'vitest';
import { createTestApplication } from '../../testing/create-test-application';
import { CountyGuardiansViewModel } from './county-guardians-view-model';
import { CountyGuardianDetailViewModel } from './county-guardian-detail-view-model';

describe('CountyGuardiansViewModel', () => {
  it('passes the query through and keeps it in the store', async () => {
    const { app, ports } = createTestApplication();
    const vm = new CountyGuardiansViewModel({ county: app.county });
    expect(vm.store.getState().query).toEqual({ page: 1, limit: 12 });
    const query = { search: 'ada', relationship: 'Father', page: 2, limit: 12 };
    await vm.load(query);
    expect(ports.countyGuardians.lastQuery).toEqual(query);
    expect(vm.store.getState().query).toEqual(query);
    expect(vm.store.getState().summary.status).toBe('success');
  });
});

describe('CountyGuardianDetailViewModel', () => {
  it('records the requested id before loading; an unknown guardian is empty', async () => {
    const { app } = createTestApplication();
    const vm = new CountyGuardianDetailViewModel({ county: app.county });
    expect(vm.store.getState().requestedId).toBeNull();
    const loading = vm.load('g-9');
    expect(vm.store.getState().requestedId).toBe('g-9');
    await loading;
    expect(vm.store.getState().detail.status).toBe('empty');
  });
});
