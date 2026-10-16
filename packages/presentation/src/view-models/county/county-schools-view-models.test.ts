import { describe, expect, it } from 'vitest';
import { createTestApplication } from '../../testing/create-test-application';
import { CountySchoolsViewModel } from './county-schools-view-model';
import { CountySchoolDetailViewModel } from './county-school-detail-view-model';

const detail = {
  id: 's-1', name: 'Alpha', code: 'A', type: 'SCHOOL', ownership: 'GOVERNMENT', approvalStatus: 'APPROVED', isActive: true,
  street: '1 Road', communityTown: null, contactPhone: null, contactPersonPhone: null, emisCode: null, officialSchoolCode: null,
  metadata: { statistics: { maxCapacity: 100 } }, levels: ['PRIMARY'], details: { establishedYear: 1998, hasLibrary: true },
  districtName: 'Buchanan', countyName: 'Grand Bassa', studentCount: 40, staffCount: 3,
  principal: { firstName: 'Ada', lastName: 'Doe', email: 'ada@x', photoUrl: null },
};

describe('CountySchoolsViewModel', () => {
  it('shapes schools like portal-web findAll', async () => {
    const { app, ports } = createTestApplication();
    ports.countySchools.schools = [
      { id: 's-1', name: 'Alpha', code: 'A', type: 'SCHOOL', isActive: true, districtName: 'Buchanan', levels: ['PRIMARY'], studentCount: 40, photoUrl: null },
    ];
    const vm = new CountySchoolsViewModel({ county: app.county });
    await vm.load();
    const s = vm.store.getState().summary;
    expect(s.status).toBe('success');
    if (s.status !== 'success') return;
    expect(s.data.schools[0]).toEqual({
      id: 's-1', name: 'Alpha', code: 'A', isActive: true, photoUrl: null,
      district: { name: 'Buchanan' }, levels: [{ level: 'PRIMARY' }], _count: { students: 40 },
    });
  });
});

describe('CountySchoolDetailViewModel', () => {
  it('spreads details and shapes the principal as an INSTITUTION_ADMIN user', async () => {
    const { app, ports } = createTestApplication();
    ports.countySchools.schoolById.set('s-1', detail);
    const vm = new CountySchoolDetailViewModel({ county: app.county });
    await vm.load('s-1');
    const s = vm.store.getState().detail;
    expect(s.status).toBe('success');
    if (s.status !== 'success') return;
    expect(s.data).toMatchObject({
      establishedYear: 1998, hasLibrary: true, address: '1 Road',
      district: { name: 'Buchanan' }, county: { name: 'Grand Bassa' }, _count: { students: 40, staff: 3 },
      users: [{ role: 'INSTITUTION_ADMIN', user: { firstName: 'Ada', lastName: 'Doe', email: 'ada@x', photoUrl: null } }],
    });
  });

  it('is empty for an unknown school', async () => {
    const { app } = createTestApplication();
    const vm = new CountySchoolDetailViewModel({ county: app.county });
    await vm.load('nope');
    expect(vm.store.getState().detail.status).toBe('empty');
  });
});
