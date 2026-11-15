import { describe, expect, it } from 'vitest';
import type { DeoApplicationService } from '@nemis-desktop/application';
import { createTestApplication } from '../../testing/create-test-application';
import { DeoDashboardViewModel } from './deo-dashboard-view-model';

describe('DeoDashboardViewModel', () => {
  it('loads the dashboard for the district of the signed-in officer', async () => {
    const { app, ports } = createTestApplication();
    ports.districtOverview.district = { id: 'd-1', name: 'Buchanan', countyId: 'c-1' };
    ports.districtOverview.county = { id: 'c-1', name: 'Grand Bassa' };
    ports.districtOverview.schools = [{ id: 's-1', name: 'Alpha', code: 'A1', levels: ['PRIMARY'] }];
    ports.districtOverview.studentsBySchool = [{ institutionId: 's-1', count: 12 }];
    const vm = new DeoDashboardViewModel({ deo: app.deo });

    expect(vm.store.getState().summary.status).toBe('idle');
    const loading = vm.loadDashboard();
    expect(vm.store.getState().summary.status).toBe('loading');
    await loading;

    const summary = vm.store.getState().summary;
    expect(summary.status).toBe('success');
    if (summary.status !== 'success') return;
    expect(summary.data.district).toEqual({ id: 'd-1', name: 'Buchanan' });
    expect(summary.data.county).toEqual({ id: 'c-1', name: 'Grand Bassa' });
    expect(summary.data.stats).toMatchObject({ totalSchools: 1, totalStudents: 12 });
    expect(summary.data.schools[0]).toMatchObject({ id: 's-1', levels: ['PRIMARY'] });
  });

  it('renders a district with no schools as success, not empty', async () => {
    const { app } = createTestApplication();
    const vm = new DeoDashboardViewModel({ deo: app.deo });
    await vm.loadDashboard();
    expect(vm.store.getState().summary.status).toBe('success');
  });

  it('keeps the previous data while reloading', async () => {
    const { app } = createTestApplication();
    const vm = new DeoDashboardViewModel({ deo: app.deo });
    await vm.loadDashboard();
    const reload = vm.loadDashboard();
    expect(vm.store.getState().summary.status).toBe('refreshing');
    await reload;
    expect(vm.store.getState().summary.status).toBe('success');
  });

  it('moves to error when the service fails', async () => {
    const failing = {
      getDashboard: async () => {
        throw new Error('database locked');
      },
    } as unknown as DeoApplicationService;
    const vm = new DeoDashboardViewModel({ deo: failing });
    await vm.loadDashboard();
    expect(vm.store.getState().summary.status).toBe('error');
  });

  it('resolves an alert once, then reloads', async () => {
    const { app, ports } = createTestApplication();
    const vm = new DeoDashboardViewModel({ deo: app.deo });
    await vm.loadDashboard();
    const readsBefore = ports.districtOverview.calls.filter((call) => call.method === 'listActiveSchools').length;

    const resolving = vm.resolveAlert('a-1');
    expect(vm.store.getState().resolvingAlertId).toBe('a-1');
    await resolving;

    expect(ports.districtAlerts.calls.map((call) => call.alertId)).toEqual(['a-1']);
    expect(ports.districtOverview.calls.filter((call) => call.method === 'listActiveSchools')).toHaveLength(
      readsBefore + 1,
    );
    expect(vm.store.getState().resolvingAlertId).toBeNull();
    expect(vm.store.getState().summary.status).toBe('success');
  });

  it('clears the resolving marker and keeps the data when resolving fails', async () => {
    const { app } = createTestApplication();
    const failing = {
      getDashboard: () => app.deo.getDashboard(),
      resolveAlert: async () => {
        throw new Error('disk full');
      },
    } as unknown as DeoApplicationService;
    const vm = new DeoDashboardViewModel({ deo: failing });
    await vm.loadDashboard();
    await expect(vm.resolveAlert('a-1')).resolves.toBeUndefined();
    expect(vm.store.getState().resolvingAlertId).toBeNull();
    expect(vm.store.getState().resolveError).toMatchObject({ kind: expect.any(String) });
    expect(vm.store.getState().summary.status).toBe('success');
  });

  it('ignores a second resolve while one is running', async () => {
    const { app, ports } = createTestApplication();
    const vm = new DeoDashboardViewModel({ deo: app.deo });
    await vm.loadDashboard();
    await Promise.all([vm.resolveAlert('a-1'), vm.resolveAlert('a-2')]);
    expect(ports.districtAlerts.calls.map((call) => call.alertId)).toEqual(['a-1']);
  });
});
