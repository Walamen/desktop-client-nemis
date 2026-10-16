import { describe, expect, it } from 'vitest';
import { RecordingLogger } from '../../testing/recording-logger';
import { InMemoryCountyAnalyticsReadModel } from '../../testing/county/in-memory-county-analytics-read-model';
import { InMemoryCountyDistrictsReadModel } from '../../testing/county/in-memory-county-districts-read-model';
import { InMemoryCountySchoolsReadModel } from '../../testing/county/in-memory-county-schools-read-model';
import { GetCountySchoolsUseCase } from './get-county-schools';
import { GetCountySchoolDetailUseCase } from './get-county-school-detail';

const listItem = {
  id: 's-1', name: 'Alpha', code: 'A', type: 'SCHOOL', isActive: true,
  districtName: 'Buchanan', levels: ['PRIMARY'], studentCount: 40, photoUrl: null,
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
      logger: new RecordingLogger(),
    }).execute({});
    expect(data).toEqual({ county: { id: 'county-1', name: 'Grand Bassa' }, districtCount: 2, schools: [listItem] });
  });
});

describe('GetCountySchoolDetailUseCase', () => {
  it('returns null for an unknown or other-county school', async () => {
    const { data } = await new GetCountySchoolDetailUseCase({
      readModel: new InMemoryCountySchoolsReadModel(),
      logger: new RecordingLogger(),
    }).execute({ schoolId: 'nope' });
    expect(data).toBeNull();
  });
});
