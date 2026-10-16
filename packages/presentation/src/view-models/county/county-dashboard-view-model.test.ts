import { describe, expect, it } from 'vitest';
import type { CountyApplicationService } from '@nemis-desktop/application';
import { createTestApplication } from '../../testing/create-test-application';
import { CountyDashboardViewModel } from './county-dashboard-view-model';

describe('CountyDashboardViewModel', () => {
  it('loads the dashboard and shapes districts for the ported scorecard', async () => {
    const { app, ports } = createTestApplication();
    ports.countyAnalytics.county = { id: 'county-1', name: 'Grand Bassa' };
    ports.countyAnalytics.districts = [{ id: 'd-1', name: 'Buchanan', activeSchoolCount: 2 }];
    ports.countyAnalytics.activeSchools = 2;
    ports.countyAnalytics.activeStudents = 9;
    const vm = new CountyDashboardViewModel({ county: app.county });

    await vm.loadDashboard();

    const summary = vm.store.getState().summary;
    expect(summary.status).toBe('success');
    if (summary.status !== 'success') return;
    expect(summary.data.county).toEqual({ id: 'county-1', name: 'Grand Bassa' });
    expect(summary.data.districts).toEqual([{ id: 'd-1', name: 'Buchanan', _count: { institutions: 2 } }]);
    expect(summary.data.stats).toEqual({ totalSchools: 2, totalStudents: 9, totalTeachers: 0 });
    expect(summary.data.chartData.enrollmentTrend).toHaveLength(12);
  });

  it('renders real zeros (success, not empty) for an empty county', async () => {
    const { app } = createTestApplication();
    const vm = new CountyDashboardViewModel({ county: app.county });
    await vm.loadDashboard();
    expect(vm.store.getState().summary.status).toBe('success');
  });

  it('keeps the previous data while reloading', async () => {
    const { app } = createTestApplication();
    const vm = new CountyDashboardViewModel({ county: app.county });
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
    } as unknown as CountyApplicationService;
    const vm = new CountyDashboardViewModel({ county: failing });
    await vm.loadDashboard();
    expect(vm.store.getState().summary.status).toBe('error');
  });
});
