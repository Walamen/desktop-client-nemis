import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../testing/fixed-clock';
import { RecordingLogger } from '../../testing/recording-logger';
import { InMemoryDistrictOverviewReadModel } from '../../testing/deo/in-memory-district-overview';
import type { DistrictSchoolAdminRow } from '../../interfaces/deo/district-overview-read-model';
import { GetDeoSchoolAdminsUseCase } from './get-deo-school-admins';

const NOW = '2026-11-16T12:00:00.000Z';

function admin(userId: string, schoolId: string, schoolName: string, firstName: string): DistrictSchoolAdminRow {
  return {
    userId,
    firstName,
    lastName: 'Doe',
    photoUrl: null,
    schoolId,
    schoolName,
    employeeNumber: null,
    isActive: true,
    joinedAt: null,
    lastLoginAt: null,
  };
}

function readModel() {
  const model = new InMemoryDistrictOverviewReadModel();
  model.district = { id: 'd-1', name: 'Buchanan', countyId: 'c-1' };
  model.county = { id: 'c-1', name: 'Grand Bassa' };
  model.schools = [
    { id: 's-1', name: 'Alpha', code: 'A', levels: [] },
    { id: 's-2', name: 'Beta', code: 'B', levels: [] },
    { id: 's-3', name: 'Gamma', code: 'G', levels: [] },
  ];
  model.schoolAdminRows = [
    admin('u-3', 's-2', 'Beta', 'Zed'),
    admin('u-2', 's-1', 'Alpha', 'Musu'),
    admin('u-1', 's-1', 'Alpha', 'Ann'),
  ];
  model.infrastructureIssues = [{ institutionId: 's-1', count: 2 }];
  return model;
}

function run(model: InMemoryDistrictOverviewReadModel, districtId: string | null = 'd-1') {
  return new GetDeoSchoolAdminsUseCase({
    readModel: model,
    currentDistrictId: districtId,
    clock: new FixedClock(NOW),
    logger: new RecordingLogger(),
  }).execute({});
}

describe('GetDeoSchoolAdminsUseCase', () => {
  it('lists the admins by school then name, with the school infrastructure issues', async () => {
    const { data } = await run(readModel());
    expect(data.district).toEqual({ id: 'd-1', name: 'Buchanan' });
    expect(data.county).toEqual({ id: 'c-1', name: 'Grand Bassa' });
    expect(data.admins.map((a) => [a.schoolName, a.firstName, a.openInfrastructureIssues])).toEqual([
      ['Alpha', 'Ann', 2],
      ['Alpha', 'Musu', 2],
      ['Beta', 'Zed', 0],
    ]);
  });

  it('asks for the district only', async () => {
    const model = readModel();
    await run(model);
    expect(model.argsOf('listSchoolAdmins')).toEqual(['d-1']);
  });

  it('names the active schools with no School Admin', async () => {
    const { data } = await run(readModel());
    expect(data.schoolsWithoutAdmin).toEqual([{ id: 's-3', name: 'Gamma' }]);
  });

  it('reads nothing when no district is assigned', async () => {
    const model = readModel();
    const { data } = await run(model, null);
    expect(data).toEqual({ districtId: null, district: null, county: null, admins: [], schoolsWithoutAdmin: [] });
    expect(model.calls).toEqual([]);
  });
});
