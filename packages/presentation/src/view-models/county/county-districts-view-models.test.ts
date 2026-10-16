import { describe, expect, it } from 'vitest';
import { createTestApplication } from '../../testing/create-test-application';
import { CountyDistrictsViewModel } from './county-districts-view-model';
import { CountyDistrictDetailViewModel } from './county-district-detail-view-model';

describe('CountyDistrictsViewModel', () => {
  it('shapes districts like portal-web findAll(includeDeo)', async () => {
    const { app, ports } = createTestApplication();
    ports.countyDistricts.districts = [{
      id: 'd-1', name: 'Buchanan', code: 'D1', isActive: true, activeSchoolCount: 2, activeDeoCount: 1,
      firstDeo: { userId: 'deo-1', firstName: 'Musu', lastName: 'Kollie', email: 'm@x', photoUrl: null },
    }];
    ports.countyDistricts.officersByDistrict.set('d-1', [{ userId: 'deo-1', name: 'Musu Kollie', email: 'm@x', phoneNumber: null, isActive: true, lastLoginAt: null, photoUrl: null }]);
    const vm = new CountyDistrictsViewModel({ county: app.county });
    await vm.load();
    const s = vm.store.getState().summary;
    expect(s.status).toBe('success');
    if (s.status !== 'success') return;
    expect(s.data.districts[0]).toEqual({
      id: 'd-1', name: 'Buchanan', code: 'D1', isActive: true,
      _count: { institutions: 2, users: 1 },
      users: [{ user: { id: 'deo-1', firstName: 'Musu', lastName: 'Kollie', email: 'm@x', imageUrl: null } }],
    });
    expect(s.data.officersByDistrict['d-1']).toEqual([{ userId: 'deo-1', name: 'Musu Kollie', email: 'm@x' }]);
  });

  it('keeps the data on screen while reloading', async () => {
    const { app } = createTestApplication();
    const vm = new CountyDistrictsViewModel({ county: app.county });
    await vm.load();
    const reload = vm.load();
    expect(vm.store.getState().summary.status).toBe('refreshing');
    await reload;
  });
});

describe('CountyDistrictDetailViewModel', () => {
  it('splits SCHOOL-type rows from the district fallback list and maps street to address', async () => {
    const { app, ports } = createTestApplication();
    ports.countyDistricts.districtById.set('d-1', { id: 'd-1', name: 'Buchanan', code: 'D1', isActive: true });
    const base = { code: 'A', emisCode: null, officialSchoolCode: null, communityTown: null, ownership: 'PUBLIC', contactPhone: null, contactPersonPhone: null, metadata: null, isActive: true };
    ports.countyDistricts.institutionsByDistrict.set('d-1', [
      { ...base, id: 'a', name: 'Alpha', type: 'TVET', street: '1 Road' },
      { ...base, id: 'b', name: 'Beta', type: 'SCHOOL', street: null },
    ]);
    const vm = new CountyDistrictDetailViewModel({ county: app.county });
    await vm.load('d-1');
    const s = vm.store.getState().detail;
    expect(s.status).toBe('success');
    if (s.status !== 'success') return;
    expect(s.data.schools.map((x) => x.id)).toEqual(['b']);
    expect(s.data.district.institutions.map((x) => [x.id, x.address])).toEqual([['a', '1 Road'], ['b', null]]);
  });

  it('is empty for an unknown district', async () => {
    const { app } = createTestApplication();
    const vm = new CountyDistrictDetailViewModel({ county: app.county });
    await vm.load('nope');
    expect(vm.store.getState().detail.status).toBe('empty');
  });
});
