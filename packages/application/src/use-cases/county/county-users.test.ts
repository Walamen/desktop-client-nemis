import { describe, expect, it } from 'vitest';
import { RecordingLogger } from '../../testing/recording-logger';
import { InMemoryCountyAnalyticsReadModel } from '../../testing/county/in-memory-county-analytics-read-model';
import { InMemoryCountyUsersReadModel } from '../../testing/county/in-memory-county-users-read-model';
import { GetCountyUsersUseCase } from './get-county-users';
import { GetCountyUserOptionsUseCase } from './get-county-user-options';

function countyModel() {
  const countyReadModel = new InMemoryCountyAnalyticsReadModel();
  countyReadModel.county = { id: 'county-1', name: 'Grand Bassa' };
  return countyReadModel;
}

describe('GetCountyUsersUseCase', () => {
  it("listUsers merges the county into the read model's page", async () => {
    const readModel = new InMemoryCountyUsersReadModel({
      list: {
        stats: { totalUsers: 3, activeUsers: 2, pendingActivation: 1, schoolAdmins: 1 },
        data: [],
        total: 3,
      },
      options: { districts: [], schools: [] },
    });
    const query = { search: 'ada', role: 'DEO' as const, page: 2, limit: 12 };

    const { data } = await new GetCountyUsersUseCase({
      readModel,
      countyReadModel: countyModel(),
      logger: new RecordingLogger(),
    }).execute(query);

    expect(readModel.lastQuery).toEqual(query);
    expect(data).toEqual({ ...readModel.list, county: { id: 'county-1', name: 'Grand Bassa' } });
  });
});

describe('GetCountyUserOptionsUseCase', () => {
  it('getUserOptions merges the county into districts and schools', async () => {
    const readModel = new InMemoryCountyUsersReadModel({
      list: { stats: { totalUsers: 0, activeUsers: 0, pendingActivation: 0, schoolAdmins: 0 }, data: [], total: 0 },
      options: {
        districts: [{ id: 'd-1', name: 'Buchanan' }],
        schools: [{ id: 's-1', name: 'Central High', districtId: 'd-1' }],
      },
    });

    const { data } = await new GetCountyUserOptionsUseCase({
      readModel,
      countyReadModel: countyModel(),
      logger: new RecordingLogger(),
    }).execute({});

    expect(data).toEqual({ ...readModel.options, county: { id: 'county-1', name: 'Grand Bassa' } });
  });
});
