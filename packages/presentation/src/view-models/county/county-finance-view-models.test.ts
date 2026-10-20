import { describe, expect, it } from 'vitest';
import { createTestApplication } from '../../testing/create-test-application';
import { CountyFinanceViewModel } from './county-finance-view-model';
import { CountyFeeRulesViewModel } from './county-fee-rules-view-model';

describe('CountyFinanceViewModel', () => {
  it('starts idle with the first payments page of 50', () => {
    const { app } = createTestApplication();
    const vm = new CountyFinanceViewModel({ county: app.county });
    const state = vm.store.getState();
    expect(state.dashboard.status).toBe('idle');
    expect(state.schools.status).toBe('idle');
    expect(state.payments.status).toBe('idle');
    expect(state.paymentsQuery).toEqual({ page: 1, limit: 50 });
  });

  it('loadDashboard carries the county', async () => {
    const { app, ports } = createTestApplication();
    ports.countyAnalytics.county = { id: 'county-1', name: 'Grand Bassa' };
    const vm = new CountyFinanceViewModel({ county: app.county });
    await vm.loadDashboard();
    const dashboard = vm.store.getState().dashboard;
    expect(dashboard.status).toBe('success');
    expect(dashboard.status === 'success' && dashboard.data.county).toEqual({ id: 'county-1', name: 'Grand Bassa' });
  });

  it('loadPayments passes the query through and stores it', async () => {
    const { app, ports } = createTestApplication();
    const vm = new CountyFinanceViewModel({ county: app.county });
    const query = { search: 'mary', districtId: 'd-1', ownership: 'PRIVATE' as const, page: 2, limit: 50 };
    await vm.loadPayments(query);
    expect(ports.countyFinance.lastCollectionsQuery).toEqual(query);
    expect(vm.store.getState().paymentsQuery).toEqual(query);
    expect(vm.store.getState().payments.status).toBe('success');
  });

  it('loadSchools with no rows is success with an empty list', async () => {
    const { app } = createTestApplication();
    const vm = new CountyFinanceViewModel({ county: app.county });
    await vm.loadSchools();
    expect(vm.store.getState().schools).toEqual({ status: 'success', data: [] });
  });

  it('a failed dashboard load is an error state', async () => {
    const { app, ports } = createTestApplication();
    ports.countyFinance.dashboardError = new Error('database locked');
    const vm = new CountyFinanceViewModel({ county: app.county });
    await vm.loadDashboard();
    expect(vm.store.getState().dashboard.status).toBe('error');
  });
});

describe('CountyFeeRulesViewModel', () => {
  it('starts idle with the first page of 10', () => {
    const { app } = createTestApplication();
    const vm = new CountyFeeRulesViewModel({ county: app.county });
    expect(vm.store.getState().rules.status).toBe('idle');
    expect(vm.store.getState().query).toEqual({ page: 1, limit: 10 });
  });

  it('fee rules load passes the query through', async () => {
    const { app, ports } = createTestApplication();
    const vm = new CountyFeeRulesViewModel({ county: app.county });
    const query = { search: 'alpha', ownership: 'MISSION' as const, page: 3, limit: 10 };
    await vm.load(query);
    expect(ports.countyFinance.lastRulesQuery).toEqual(query);
    expect(vm.store.getState().query).toEqual(query);
    expect(vm.store.getState().rules.status).toBe('success');
  });
});
