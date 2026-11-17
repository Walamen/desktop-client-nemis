import { describe, expect, it } from 'vitest';
import { RecordingLogger } from '../../testing/recording-logger';
import { InMemoryDistrictOverviewReadModel } from '../../testing/deo/in-memory-district-overview';
import { GetDeoSettingsUseCase } from './get-deo-settings';

function run(districtId: string | null) {
  const readModel = new InMemoryDistrictOverviewReadModel();
  readModel.district = { id: 'd-1', name: 'Buchanan', countyId: 'c-1' };
  readModel.county = { id: 'c-1', name: 'Grand Bassa' };
  readModel.userProfile = { firstName: 'Dee', lastName: 'Officer', email: 'dee@nemis.lr', phoneNumber: null };
  const useCase = new GetDeoSettingsUseCase({
    readModel,
    currentDistrictId: districtId,
    currentUserId: 'deo-1',
    logger: new RecordingLogger(),
  });
  return { readModel, result: useCase.execute({}) };
}

describe('GetDeoSettingsUseCase', () => {
  it("reads the signed-in DEO's synced profile with the district and county", async () => {
    const { readModel, result } = run('d-1');
    expect((await result).data).toEqual({
      districtId: 'd-1',
      district: { id: 'd-1', name: 'Buchanan' },
      county: { id: 'c-1', name: 'Grand Bassa' },
      profile: { firstName: 'Dee', lastName: 'Officer', email: 'dee@nemis.lr', phoneNumber: null },
    });
    expect(readModel.argsOf('getUserProfile')).toEqual(['deo-1']);
  });

  it('without a district, reads nothing', async () => {
    const { readModel, result } = run(null);
    expect((await result).data).toEqual({ districtId: null, district: null, county: null, profile: null });
    expect(readModel.calls).toEqual([]);
  });
});
