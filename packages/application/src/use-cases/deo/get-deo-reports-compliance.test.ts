import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../testing/fixed-clock';
import { RecordingLogger } from '../../testing/recording-logger';
import { InMemoryDistrictOverviewReadModel } from '../../testing/deo/in-memory-district-overview';
import { GetDeoReportsComplianceUseCase } from './get-deo-reports-compliance';
import { GetDeoSchoolsUseCase } from './get-deo-schools';

const NOW = '2026-11-16T12:00:00.000Z';

function readModelWithSchools() {
  const readModel = new InMemoryDistrictOverviewReadModel();
  readModel.district = { id: 'd-1', name: 'Buchanan', countyId: 'c-1' };
  readModel.county = { id: 'c-1', name: 'Grand Bassa' };
  readModel.schools = [
    { id: 's-1', name: 'Alpha', code: 'A1', levels: [], metadataPrincipal: null },
    { id: 's-2', name: 'Beta', code: 'B1', levels: [], metadataPrincipal: null },
  ];
  readModel.schoolAdmins = [{ institutionId: 's-1', name: 'Jallah Doe' }];
  readModel.reportMonths = [
    { institutionId: 's-1', month: '2026-09' },
    { institutionId: 's-1', month: '2026-11' },
  ];
  readModel.lastSubmissions = [{ institutionId: 's-1', submittedAt: '2026-11-03T10:00:00.000Z' }];
  readModel.registrations = [
    { institutionId: 's-1', approvalStatus: 'APPROVED', approvedAt: '2025-02-10T00:00:00.000Z', createdAt: '2025-01-05T00:00:00.000Z' },
  ];
  readModel.teacherRoster = [
    { institutionId: 's-1', total: 4, awaitingApproval: 1, newestCreatedAt: '2026-09-01T00:00:00.000Z' },
  ];
  return readModel;
}

const deps = (readModel: InMemoryDistrictOverviewReadModel, districtId: string | null = 'd-1') => ({
  readModel,
  finance: { listSchools: () => [] },
  currentDistrictId: districtId,
  clock: new FixedClock(NOW),
  logger: new RecordingLogger(),
});

describe('GetDeoReportsComplianceUseCase', () => {
  it('no district gives an empty result', async () => {
    const readModel = readModelWithSchools();
    const { data } = await new GetDeoReportsComplianceUseCase(deps(readModel, null)).execute({});
    expect(data).toEqual({
      districtId: null,
      district: null,
      county: null,
      summary: { total: 0, approved: 0, pending: 0, rejected: 0, missing: 0 },
      items: [],
    });
    expect(readModel.calls).toEqual([]);
  });

  it('monthly reports agree with the Schools page', async () => {
    const readModel = readModelWithSchools();
    const { data } = await new GetDeoReportsComplianceUseCase(deps(readModel)).execute({});
    const schools = await new GetDeoSchoolsUseCase(deps(readModel)).execute({});
    for (const school of schools.data.schools) {
      const k = school.reportMonths.filter(Boolean).length;
      const row = data.items.find((i) => i.schoolId === school.id && i.reportType === 'Monthly Reports')!;
      expect(row.note).toBe(`${k}/3 months with a submitted report`);
      expect(row.status).toBe(k >= 3 ? 'APPROVED' : k > 0 ? 'PENDING' : 'MISSING');
    }
    expect(schools.data.schools.map((s) => s.reportMonths)).toEqual([
      [true, false, true],
      [false, false, false],
    ]);
  });

  it('registration uses the schools-row principal', async () => {
    const { data } = await new GetDeoReportsComplianceUseCase(deps(readModelWithSchools())).execute({});
    const row = data.items.find((i) => i.id === 's-1:registration')!;
    expect(row.submittedBy).toBe('Jallah Doe');
    expect(row.status).toBe('APPROVED');
  });

  it('school with nothing gives three MISSING rows', async () => {
    const readModel = readModelWithSchools();
    readModel.schools = [readModel.schools[1]!];
    readModel.registrations = [];
    readModel.teacherRoster = [];
    readModel.reportMonths = [];
    readModel.lastSubmissions = [];
    const { data } = await new GetDeoReportsComplianceUseCase(deps(readModel)).execute({});
    expect(data.items).toHaveLength(3);
    expect(data.summary).toEqual({ total: 3, approved: 0, pending: 0, rejected: 0, missing: 3 });
  });

  it('header names come from the district and county', async () => {
    const readModel = readModelWithSchools();
    const { data } = await new GetDeoReportsComplianceUseCase(deps(readModel)).execute({});
    expect(readModel.argsOf('listSchoolRegistrations')).toEqual(['d-1']);
    expect(readModel.argsOf('teacherRosterBySchool')).toEqual(['d-1']);
    expect(data.districtId).toBe('d-1');
    expect(data.district).toEqual({ id: 'd-1', name: 'Buchanan' });
    expect(data.county).toEqual({ id: 'c-1', name: 'Grand Bassa' });
    expect(data.items.map((i) => i.id)).toEqual([
      's-1:registration', 's-1:teachers', 's-1:monthly-reports',
      's-2:registration', 's-2:teachers', 's-2:monthly-reports',
    ]);
  });
});
