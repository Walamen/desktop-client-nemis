import { describe, expect, it } from 'vitest';
import type { DeoApplicationService } from '@nemis-desktop/application';
import { createTestApplication } from '../../testing/create-test-application';
import { DeoSchoolsViewModel } from './deo-schools-view-model';

describe('DeoSchoolsViewModel', () => {
  it('loads the schools of the signed-in officer', async () => {
    const { app, ports } = createTestApplication();
    ports.districtOverview.district = { id: 'd-1', name: 'Buchanan', countyId: 'c-1' };
    ports.districtOverview.schools = [{ id: 's-1', name: 'Alpha', code: 'A1', levels: ['PRIMARY'] }];
    const vm = new DeoSchoolsViewModel({ deo: app.deo });
    const loading = vm.load();
    expect(vm.store.getState().schools.status).toBe('loading');
    await loading;
    const state = vm.store.getState().schools;
    expect(state.status).toBe('success');
    if (state.status !== 'success') return;
    expect(state.data.district).toEqual({ id: 'd-1', name: 'Buchanan' });
    expect(state.data.schools.map((s) => s.id)).toEqual(['s-1']);
  });

  it('moves to error when the service fails', async () => {
    const failing = {
      listSchools: async () => {
        throw new Error('database locked');
      },
    } as unknown as DeoApplicationService;
    const vm = new DeoSchoolsViewModel({ deo: failing });
    await vm.load();
    expect(vm.store.getState().schools.status).toBe('error');
  });
});
