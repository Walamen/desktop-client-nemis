import { describe, expect, it } from 'vitest';
import { RecordingLogger } from '../../testing/recording-logger';
import { InMemoryCountyAnalyticsReadModel } from '../../testing/county/in-memory-county-analytics-read-model';
import { InMemoryCountyDistrictsReadModel } from '../../testing/county/in-memory-county-districts-read-model';
import { GetCountyDistrictsUseCase } from './get-county-districts';
import { GetCountyDistrictDetailUseCase } from './get-county-district-detail';

const officer = {
  userId: 'deo-1', name: 'Musu Kollie', email: 'musu@moe.gov.lr', phoneNumber: null,
  isActive: true, lastLoginAt: null, photoUrl: null,
};

function deps() {
  const readModel = new InMemoryCountyDistrictsReadModel();
  const countyReadModel = new InMemoryCountyAnalyticsReadModel();
  countyReadModel.county = { id: 'county-1', name: 'Grand Bassa' };
  return { readModel, countyReadModel, logger: new RecordingLogger() };
}

describe('GetCountyDistrictsUseCase', () => {
  it("returns the county, districts, DEO users and each district's officers", async () => {
    const d = deps();
    d.readModel.districts = [
      { id: 'd-1', name: 'Buchanan', code: 'D1', isActive: true, activeSchoolCount: 2, activeDeoCount: 1, firstDeo: null },
      { id: 'd-2', name: 'Owensgrove', code: 'D2', isActive: true, activeSchoolCount: 0, activeDeoCount: 0, firstDeo: null },
    ];
    d.readModel.officersByDistrict.set('d-1', [officer]);
    d.readModel.deoUsers = [{ id: 'deo-1', firstName: 'Musu', lastName: 'Kollie', email: null, phoneNumber: null, isActive: true, lastLoginAt: null, photoUrl: null, districtId: 'd-1' }];
    const { data } = await new GetCountyDistrictsUseCase(d).execute({});
    expect(data.county).toEqual({ id: 'county-1', name: 'Grand Bassa' });
    expect(data.districts.map((x) => x.id)).toEqual(['d-1', 'd-2']);
    expect(data.officersByDistrict).toEqual({ 'd-1': [officer], 'd-2': [] });
    expect(data.deoUsers).toHaveLength(1);
  });
});

describe('GetCountyDistrictDetailUseCase', () => {
  it('computes the stats like getDistrictStats, rounding the ratio', async () => {
    const d = deps();
    d.readModel.districtById.set('d-1', { id: 'd-1', name: 'Buchanan', code: 'D1', isActive: true });
    d.readModel.countsByDistrict.set('d-1', { schools: 3, students: 250, teachers: 7, deos: 1 });
    d.readModel.officersByDistrict.set('d-1', [officer]);
    const { data } = await new GetCountyDistrictDetailUseCase(d).execute({ districtId: 'd-1' });
    expect(data?.stats).toEqual({ totalSchools: 3, totalStudents: 250, totalTeachers: 7, deoCount: 1, studentTeacherRatio: 36 });
    expect(data?.officers).toEqual([officer]);
    expect(data?.district.name).toBe('Buchanan');
  });

  it('reports a zero ratio when the district has no teachers', async () => {
    const d = deps();
    d.readModel.districtById.set('d-1', { id: 'd-1', name: 'Buchanan', code: null, isActive: true });
    d.readModel.countsByDistrict.set('d-1', { schools: 1, students: 40, teachers: 0, deos: 0 });
    const { data } = await new GetCountyDistrictDetailUseCase(d).execute({ districtId: 'd-1' });
    expect(data?.stats.studentTeacherRatio).toBe(0);
  });

  it('returns null for an unknown or other-county district', async () => {
    const { data } = await new GetCountyDistrictDetailUseCase(deps()).execute({ districtId: 'nope' });
    expect(data).toBeNull();
  });
});
