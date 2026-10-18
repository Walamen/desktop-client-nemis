import { describe, expect, it } from 'vitest';
import { RecordingLogger } from '../../testing/recording-logger';
import { InMemoryCountyAnalyticsReadModel } from '../../testing/county/in-memory-county-analytics-read-model';
import { InMemoryCountyDistrictsReadModel } from '../../testing/county/in-memory-county-districts-read-model';
import { InMemoryCountyGuardiansReadModel } from '../../testing/county/in-memory-county-guardians-read-model';
import { GetCountyGuardiansUseCase } from './get-county-guardians';
import { GetCountyGuardianDetailUseCase } from './get-county-guardian-detail';

describe('GetCountyGuardiansUseCase', () => {
  it('listGuardians adds the county and active districts to the read model page', async () => {
    const readModel = new InMemoryCountyGuardiansReadModel();
    readModel.page = { ...readModel.page, total: 3, stats: { total: 3, primaryGuardians: 1, childrenCovered: 4 } };
    const districtsReadModel = new InMemoryCountyDistrictsReadModel();
    districtsReadModel.districts = [
      { id: 'd-1', name: 'Buchanan', code: null, isActive: true, activeSchoolCount: 1, activeDeoCount: 0, firstDeo: null },
    ];
    const countyReadModel = new InMemoryCountyAnalyticsReadModel();
    countyReadModel.county = { id: 'county-1', name: 'Grand Bassa' };
    const query = { search: 'ada', relationship: 'Father', page: 2, limit: 12 };

    const { data } = await new GetCountyGuardiansUseCase({
      readModel,
      districtsReadModel,
      countyReadModel,
      logger: new RecordingLogger(),
    }).execute(query);

    expect(readModel.lastQuery).toEqual(query);
    expect(data).toEqual({
      ...readModel.page,
      county: { id: 'county-1', name: 'Grand Bassa' },
      districts: [{ id: 'd-1', name: 'Buchanan' }],
    });
  });
});

describe('GetCountyGuardianDetailUseCase', () => {
  it('getGuardian is null for a guardian not on the device', async () => {
    const { data } = await new GetCountyGuardianDetailUseCase({
      readModel: new InMemoryCountyGuardiansReadModel(),
      logger: new RecordingLogger(),
    }).execute({ guardianId: 'nope' });
    expect(data).toBeNull();
  });
});
