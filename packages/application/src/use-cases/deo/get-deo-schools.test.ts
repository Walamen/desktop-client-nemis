import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../testing/fixed-clock';
import { RecordingLogger } from '../../testing/recording-logger';
import { InMemoryDistrictOverviewReadModel } from '../../testing/deo/in-memory-district-overview';
import { GetDeoSchoolsUseCase } from './get-deo-schools';
import { GetDeoDashboardUseCase } from './get-deo-dashboard';

const NOW = '2026-11-16T12:00:00.000Z';

function readModelWithSchools() {
  const readModel = new InMemoryDistrictOverviewReadModel();
  readModel.district = { id: 'd-1', name: 'Buchanan', countyId: 'c-1' };
  readModel.county = { id: 'c-1', name: 'Grand Bassa' };
  readModel.schools = [
    { id: 's-1', name: 'Alpha', code: 'A1', levels: ['PRIMARY'], metadataPrincipal: 'Old Name' },
    { id: 's-2', name: 'Beta', code: 'B1', levels: [], metadataPrincipal: 'Musu Kollie' },
    { id: 's-3', name: 'Gamma', code: 'G1', levels: [], metadataPrincipal: null },
  ];
  readModel.schoolAdmins = [{ institutionId: 's-1', name: 'Jallah Doe' }];
  readModel.reportMonths = [
    { institutionId: 's-1', month: '2026-09' },
    { institutionId: 's-1', month: '2026-11' },
    { institutionId: 's-2', month: '2026-08' }, // outside the window
  ];
  return readModel;
}

function run(readModel: InMemoryDistrictOverviewReadModel, districtId: string | null = 'd-1') {
  return new GetDeoSchoolsUseCase({
    readModel,
    finance: { listSchools: () => [] },
    currentDistrictId: districtId,
    clock: new FixedClock(NOW),
    logger: new RecordingLogger(),
  }).execute({});
}

describe('GetDeoSchoolsUseCase', () => {
  it('names the district and county and lists the schools', async () => {
    const { data } = await run(readModelWithSchools());
    expect(data.districtId).toBe('d-1');
    expect(data.district).toEqual({ id: 'd-1', name: 'Buchanan' });
    expect(data.county).toEqual({ id: 'c-1', name: 'Grand Bassa' });
    expect(data.schools.map((s) => s.id)).toEqual(['s-1', 's-2', 's-3']);
  });

  it('names the School Admin first, then the metadata principal, then nobody', async () => {
    const { data } = await run(readModelWithSchools());
    expect(data.schools.map((s) => s.principalName)).toEqual(['Jallah Doe', 'Musu Kollie', null]);
  });

  it('marks the last three calendar months that had a submitted report, oldest first', async () => {
    const readModel = readModelWithSchools();
    const { data } = await run(readModel);
    expect(readModel.argsOf('reportMonthsBySchool')).toEqual(['d-1', '2026-09-01']);
    expect(data.schools.map((s) => s.reportMonths)).toEqual([
      [true, false, true],
      [false, false, false],
      [false, false, false],
    ]);
  });

  it('reads nothing when no district is assigned', async () => {
    const readModel = readModelWithSchools();
    const { data } = await run(readModel, null);
    expect(data).toEqual({ districtId: null, district: null, county: null, schools: [] });
    expect(readModel.calls).toEqual([]);
  });

  it('gives the dashboard the same rows', async () => {
    const readModel = readModelWithSchools();
    const dashboard = await new GetDeoDashboardUseCase({
      readModel,
      finance: { listSchools: () => [] },
      currentDistrictId: 'd-1',
      clock: new FixedClock(NOW),
      logger: new RecordingLogger(),
    }).execute({});
    const schools = await run(readModel);
    expect(dashboard.data.schools).toEqual(schools.data.schools);
  });
});
