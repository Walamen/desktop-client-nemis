import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../testing/fixed-clock';
import { RecordingLogger } from '../../testing/recording-logger';
import { InMemoryDistrictOverviewReadModel } from '../../testing/deo/in-memory-district-overview';
import { GetDeoFinanceAuditUseCase, GetDeoFinanceUseCase } from './get-deo-finance';

// Mid-month, local noon: the month window does not depend on the time zone.
const NOW = new Date(2026, 10, 17, 12, 0, 0).toISOString();

function model() {
  const readModel = new InMemoryDistrictOverviewReadModel();
  readModel.district = { id: 'd-1', name: 'Buchanan', countyId: 'c-1' };
  readModel.county = { id: 'c-1', name: 'Grand Bassa' };
  readModel.schools = [
    { id: 'a', name: 'Alpha', code: 'A-1', levels: [], metadataPrincipal: 'Metadata Name' },
    { id: 'b', name: 'Beta', code: 'B-1', levels: [], metadataPrincipal: 'Only Metadata' },
    { id: 'c', name: 'Gamma', code: 'C-1', levels: [], metadataPrincipal: null },
    { id: 'e', name: 'Echo', code: 'E-1', levels: [] },
    { id: 'd', name: 'Delta', code: 'D-1', levels: [] },
  ];
  readModel.schoolAdmins = [{ institutionId: 'a', name: 'Ann First' }];
  readModel.studentsBySchool = [{ institutionId: 'a', count: 40 }];
  readModel.financeRows = [
    { institutionId: 'a', allocation: 100, collected: 40 },
    { institutionId: 'b', allocation: 100, collected: 150 },
    { institutionId: 'd', allocation: 100, collected: 60 },
    { institutionId: 'e', allocation: 100, collected: 60 },
  ];
  readModel.lastPayments = [{ institutionId: 'd', paidAt: '2026-11-01T10:00:00.000Z' }];
  return readModel;
}

function run(readModel: InMemoryDistrictOverviewReadModel, districtId: string | null = 'd-1') {
  return new GetDeoFinanceUseCase({
    readModel,
    currentDistrictId: districtId,
    clock: new FixedClock(NOW),
    logger: new RecordingLogger(),
  }).execute({});
}

describe('GetDeoFinanceUseCase', () => {
  it('builds each school with the shared rules, best rate first, then name', async () => {
    const { data } = await run(model());
    expect(data.district).toEqual({ id: 'd-1', name: 'Buchanan' });
    expect(data.county).toEqual({ id: 'c-1', name: 'Grand Bassa' });
    expect(data.schools.map((s) => [s.schoolId, s.complianceRate, s.status, s.outstanding])).toEqual([
      ['b', 150, 'On Track', 0],
      ['d', 60, 'At Risk', 40],
      ['e', 60, 'At Risk', 40],
      ['a', 40, 'Behind', 60],
      ['c', 0, 'No Data', 0],
    ]);
    const alpha = data.schools.find((s) => s.schoolId === 'a')!;
    expect(alpha).toMatchObject({ schoolName: 'Alpha', schoolCode: 'A-1', principalName: 'Ann First', studentCount: 40 });
    expect(data.schools.find((s) => s.schoolId === 'b')!.principalName).toBe('Only Metadata');
    expect(data.schools.find((s) => s.schoolId === 'c')!.principalName).toBe('Not recorded');
    expect(data.schools.find((s) => s.schoolId === 'd')!.lastPaymentAt).toBe('2026-11-01T10:00:00.000Z');
    expect(data.schools.find((s) => s.schoolId === 'e')!.lastPaymentAt).toBeNull();
  });

  it('totals the rows the same way the server does', async () => {
    const { data } = await run(model());
    expect(data.summary).toEqual({
      totalAllocation: 400,
      totalCollected: 310,
      totalOutstanding: 140,
      complianceRate: 78,
      schoolsBilling: 4,
      schoolsBehind: 1,
    });
  });

  it('lists flagged activity lowest rate first, flagged below 30% with money owed', async () => {
    const readModel = model();
    readModel.financeRows.push({ institutionId: 'c', allocation: 100, collected: 10 });
    const { data } = await run(readModel);
    expect(data.flagged.map((r) => [r.schoolId, r.collectionRate, r.isFlagged])).toEqual([
      ['c', 10, true],
      ['a', 40, false],
      ['d', 60, false],
      ['e', 60, false],
      ['b', 150, false],
    ]);
    expect(data.flagged[0]).toEqual({
      schoolId: 'c',
      schoolName: 'Gamma',
      schoolCode: 'C-1',
      expected: 100,
      collected: 10,
      outstanding: 90,
      collectionRate: 10,
      isFlagged: true,
    });
  });

  it('trends six local months oldest first, zero-filled', async () => {
    const readModel = model();
    readModel.paymentMonths = [
      { month: '2026-06', amount: 100.4 },
      { month: '2026-11', amount: 250 },
    ];
    const { data } = await run(readModel);
    expect(readModel.argsOf('paymentsByMonth')).toEqual(['d-1', new Date(2026, 5, 1).toISOString()]);
    expect(data.trend).toEqual([
      { period: 'Jun', amount: 100 },
      { period: 'Jul', amount: 0 },
      { period: 'Aug', amount: 0 },
      { period: 'Sep', amount: 0 },
      { period: 'Oct', amount: 0 },
      { period: 'Nov', amount: 250 },
    ]);
  });

  it('returns an empty page and reads nothing without a district', async () => {
    const readModel = model();
    const { data } = await run(readModel, null);
    expect(data).toEqual({
      districtId: null,
      district: null,
      county: null,
      summary: {
        totalAllocation: 0,
        totalCollected: 0,
        totalOutstanding: 0,
        complianceRate: 0,
        schoolsBilling: 0,
        schoolsBehind: 0,
      },
      trend: [],
      schools: [],
      flagged: [],
    });
    expect(readModel.calls).toEqual([]);
  });
});

describe('GetDeoFinanceAuditUseCase', () => {
  it('reads the newest 50 entries for a district device, nothing without a district', async () => {
    const readModel = model();
    readModel.auditEntries = Array.from({ length: 60 }, (_, i) => ({
      id: `e-${i}`,
      timestamp: '2026-11-17T10:00:00.000Z',
      actorName: 'Ama Bursar',
      action: 'CREATE',
      entityType: 'feePayment',
      entityId: `p-${i}`,
    }));
    const audit = (districtId: string | null) =>
      new GetDeoFinanceAuditUseCase({ readModel, currentDistrictId: districtId, logger: new RecordingLogger() }).execute({});
    expect((await audit('d-1')).data).toHaveLength(50);
    expect(readModel.argsOf('listFinanceAudit')).toEqual([50]);
    readModel.calls.length = 0;
    expect((await audit(null)).data).toEqual([]);
    expect(readModel.calls).toEqual([]);
  });
});
