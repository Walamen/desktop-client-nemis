import { describe, expect, it } from 'vitest';
import type { CountySchoolDetail, SchoolRegistration } from '@nemis-desktop/types';
import { InMemorySchoolRegistrationStore } from '../../testing/county/in-memory-school-registration-store';
import { RecordingLogger } from '../../testing/recording-logger';
import { InMemoryCountyAnalyticsReadModel } from '../../testing/county/in-memory-county-analytics-read-model';
import { InMemoryCountyDistrictsReadModel } from '../../testing/county/in-memory-county-districts-read-model';
import { InMemoryCountySchoolsReadModel } from '../../testing/county/in-memory-county-schools-read-model';
import { GetCountySchoolsUseCase } from './get-county-schools';
import { GetCountySchoolDetailUseCase } from './get-county-school-detail';

const listItem = {
  id: 's-1', name: 'Alpha', code: 'A', type: 'SCHOOL', isActive: true,
  districtName: 'Buchanan', levels: ['PRIMARY'], studentCount: 40, photoUrl: null, syncState: null, syncError: null,
};

describe('GetCountySchoolsUseCase', () => {
  it('returns the county, the active-district count and the schools', async () => {
    const readModel = new InMemoryCountySchoolsReadModel();
    readModel.schools = [listItem];
    const districtsReadModel = new InMemoryCountyDistrictsReadModel();
    districtsReadModel.districts = [
      { id: 'd-1', name: 'Buchanan', code: null, isActive: true, activeSchoolCount: 1, activeDeoCount: 0, firstDeo: null },
      { id: 'd-2', name: 'Owensgrove', code: null, isActive: true, activeSchoolCount: 0, activeDeoCount: 0, firstDeo: null },
    ];
    const countyReadModel = new InMemoryCountyAnalyticsReadModel();
    countyReadModel.county = { id: 'county-1', name: 'Grand Bassa' };
    const { data } = await new GetCountySchoolsUseCase({
      readModel,
      districtsReadModel,
      countyReadModel,
      registrations: new InMemorySchoolRegistrationStore(),
      currentUserId: 'u-1',
      logger: new RecordingLogger(),
    }).execute({});
    expect(data).toEqual({ county: { id: 'county-1', name: 'Grand Bassa' }, districtCount: 2, schools: [listItem] });
  });
});

describe('GetCountySchoolDetailUseCase', () => {
  it('returns null for an unknown or other-county school', async () => {
    const { data } = await new GetCountySchoolDetailUseCase({
      readModel: new InMemoryCountySchoolsReadModel(),
      registrations: new InMemorySchoolRegistrationStore(),
      currentUserId: 'u-1',
      logger: new RecordingLogger(),
    }).execute({ schoolId: 'nope' });
    expect(data).toBeNull();
  });
});

describe('registrations merged into the Schools pages', () => {
  const registration = (id: string, name: string, extra: Partial<SchoolRegistration & { createdBy: string }> = {}): SchoolRegistration & { createdBy: string } => ({
    id,
    countyId: 'county-1',
    createdBy: 'u-1',
    source: 'form',
    payload: {
      name, code: `GB-${id}`, type: 'SCHOOL', levels: ['PRIMARY'], ownership: 'GOVERNMENT', countyId: 'county-1',
      districtId: 'd-1', isActive: true, admins: [{ email: 'ada@school.lr', firstName: 'Ada', lastName: 'Doe' }],
      address: '1 Road', establishedYear: 1998, hasLibrary: true, principalName: 'Ada Doe',
    },
    syncState: 'pending',
    syncError: null,
    principalLogin: null,
    createdAt: '2026-10-17T00:00:00.000Z',
    updatedAt: '2026-10-17T00:00:00.000Z',
    syncedAt: null,
    ...extra,
  });

  function setupMerge() {
    const readModel = new InMemoryCountySchoolsReadModel();
    const registrations = new InMemorySchoolRegistrationStore();
    registrations.county = { id: 'county-1', name: 'Grand Bassa', code: 'GB' };
    registrations.districts = [{ id: 'd-1', name: 'Buchanan' }];
    const districtsReadModel = new InMemoryCountyDistrictsReadModel();
    const countyReadModel = new InMemoryCountyAnalyticsReadModel();
    const logger = new RecordingLogger();
    return {
      readModel,
      registrations,
      list: new GetCountySchoolsUseCase({ readModel, districtsReadModel, countyReadModel, registrations, currentUserId: 'u-1', logger }),
      detail: new GetCountySchoolDetailUseCase({ readModel, registrations, currentUserId: 'u-1', logger }),
    };
  }

  it('merges waiting and refused registrations into the list by name; an institution with the same id wins', async () => {
    const { readModel, registrations, list } = setupMerge();
    readModel.schools = [{ ...listItem, id: 'b', name: 'Bravo' }];
    registrations.rows = [
      registration('a', 'Alpha'),
      registration('c', 'Charlie', { syncState: 'rejected', syncError: 'Email taken' }),
      registration('b', 'Bravo', { syncState: 'synced', principalLogin: { email: 'ada@school.lr', password: 'Nemis@123' } }),
      registration('x', 'Xray', { createdBy: 'u-2' }),
    ];
    const { data } = await list.execute({});
    expect(data.schools.map((s) => [s.name, s.syncState, s.syncError])).toEqual([
      ['Alpha', 'pending', null],
      ['Bravo', null, null],
      ['Charlie', 'rejected', 'Email taken'],
    ]);
    expect(data.schools[0]).toMatchObject({ districtName: 'Buchanan', levels: ['PRIMARY'], studentCount: 0, photoUrl: null, isActive: true });
  });

  it('a synced school the server later closed stays hidden, as on the web (its institution row exists, inactive)', async () => {
    const { registrations, list } = setupMerge();
    registrations.rows = [registration('closed', 'Closed School', { syncState: 'synced' }), registration('w', 'Waiting')];
    registrations.institutionIds.add('closed');
    const { data } = await list.execute({});
    expect(data.schools.map((s) => s.name)).toEqual(['Waiting']);
  });

  it('detail falls back to the registration and attaches the principal login once synced', async () => {
    const { readModel, registrations, detail } = setupMerge();
    registrations.rows = [registration('r-1', 'Alpha')];
    const { data: waiting } = await detail.execute({ schoolId: 'r-1' });
    expect(waiting).toMatchObject({
      id: 'r-1', name: 'Alpha', approvalStatus: 'APPROVED', street: '1 Road', staffCount: 0, studentCount: 0,
      districtName: 'Buchanan', countyName: 'Grand Bassa',
      details: { establishedYear: 1998, hasLibrary: true, principalName: 'Ada Doe' },
      principal: { firstName: 'Ada', lastName: 'Doe', email: 'ada@school.lr', photoUrl: null },
      registration: { syncState: 'pending', syncError: null, source: 'form', principalLogin: null },
    });

    const login = { email: 'ada@school.lr', password: 'Nemis@123' };
    registrations.rows = [registration('r-1', 'Alpha', { syncState: 'synced', principalLogin: login })];
    readModel.schoolById.set('r-1', { ...(waiting as CountySchoolDetail), name: 'Alpha (server)', registration: null });
    const { data: synced } = await detail.execute({ schoolId: 'r-1' });
    expect(synced).toMatchObject({ name: 'Alpha (server)', registration: { syncState: 'synced', principalLogin: login } });
  });
});
