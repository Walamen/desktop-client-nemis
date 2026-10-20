import { describe, expect, it } from 'vitest';
import { createTestApplication } from '../../testing/create-test-application';
import { CountyReportsViewModel } from './county-reports-view-model';

describe('CountyReportsViewModel', () => {
  it('starts idle with no finance time', () => {
    const { app } = createTestApplication();
    const state = new CountyReportsViewModel({ county: app.county }).store.getState();
    expect(state.options.status).toBe('idle');
    expect(state.enrollment.status).toBe('idle');
    expect(state.financeLoadedAt).toBeNull();
  });

  it('loadOptions carries the county and districts', async () => {
    const { app, ports } = createTestApplication();
    ports.countyAnalytics.county = { id: 'county-1', name: 'Grand Bassa' };
    ports.countyReports.options = { countyCode: 'GB', districts: [{ id: 'd-1', name: 'Buchanan' }] };
    const vm = new CountyReportsViewModel({ county: app.county });
    await vm.loadOptions();
    expect(vm.store.getState().options).toEqual({
      status: 'success',
      data: { county: { id: 'county-1', name: 'Grand Bassa', code: 'GB' }, districts: [{ id: 'd-1', name: 'Buchanan' }] },
    });
  });

  it('loadEnrollment passes the query through', async () => {
    const { app, ports } = createTestApplication();
    const vm = new CountyReportsViewModel({ county: app.county });
    await vm.loadEnrollment({ districtId: 'd-1', schoolId: 's-1' });
    expect(ports.countyReports.lastEnrollmentQuery).toEqual({ districtId: 'd-1', schoolId: 's-1' });
    expect(vm.store.getState().enrollment.status).toBe('success');
  });

  it('loadSchools for a district, and loadSchools("") clears without a call', async () => {
    const { app, ports } = createTestApplication();
    ports.countyReports.schoolsByDistrict.set('d-1', [{ id: 's-1', name: 'Alpha' }]);
    const vm = new CountyReportsViewModel({ county: app.county });
    await vm.loadSchools('d-1');
    expect(vm.store.getState().schools).toEqual({ status: 'success', data: [{ id: 's-1', name: 'Alpha' }] });
    await vm.loadSchools('');
    expect(vm.store.getState().schools).toEqual({ status: 'success', data: [] });
  });

  it('loadFinance fills both finance states and stamps the time', async () => {
    const { app } = createTestApplication();
    const vm = new CountyReportsViewModel({ county: app.county });
    await vm.loadFinance();
    const state = vm.store.getState();
    expect(state.financeDashboard.status).toBe('success');
    expect(state.financeSchools).toEqual({ status: 'success', data: [] });
    expect(state.financeLoadedAt).not.toBeNull();
  });

  it('a failed enrollment load is an error state', async () => {
    const { app, ports } = createTestApplication();
    ports.countyReports.enrollmentError = new Error('database locked');
    const vm = new CountyReportsViewModel({ county: app.county });
    await vm.loadEnrollment({});
    expect(vm.store.getState().enrollment.status).toBe('error');
  });
});
