import { describe, expect, it } from 'vitest';
import type { CountySchoolFinanceRow } from '@nemis-desktop/types';
import { FixedClock } from '../../testing/fixed-clock';
import { RecordingLogger } from '../../testing/recording-logger';
import { InMemoryDistrictOverviewReadModel } from '../../testing/deo/in-memory-district-overview';
import type { DistrictAlertRow } from '../../interfaces/deo/district-overview-read-model';
import { GetDeoDashboardUseCase } from './get-deo-dashboard';

// Mid-month, midday UTC: the same calendar day in every timezone within ±11h,
// so local-time month and day arithmetic gives the same answer in CI and on
// a Liberian desktop.
const NOW = '2026-11-16T12:00:00.000Z';

function financeRow(institutionId: string, totalExpected: number, collectionRate: number): CountySchoolFinanceRow {
  return {
    institutionId,
    institutionName: institutionId,
    institutionCode: institutionId,
    districtId: 'd-1',
    districtName: 'Buchanan',
    totalExpected,
    totalCollected: 0,
    totalOutstanding: 0,
    collectionRate,
    studentCount: 0,
    paidCount: 0,
    partialCount: 0,
    unpaidCount: 0,
    currency: 'LRD',
  } as CountySchoolFinanceRow;
}

function alert(id: string, severity: string, createdAt: string, institutionId: string | null = null): DistrictAlertRow {
  return { id, type: 'ATTENDANCE', severity, title: `Alert ${id}`, description: '', institutionId, createdAt };
}

function run(
  readModel: InMemoryDistrictOverviewReadModel,
  opts: { districtId?: string | null; finance?: CountySchoolFinanceRow[]; now?: string } = {},
) {
  return new GetDeoDashboardUseCase({
    readModel,
    finance: { listSchools: () => opts.finance ?? [] },
    currentDistrictId: opts.districtId === undefined ? 'd-1' : opts.districtId,
    clock: new FixedClock(opts.now ?? NOW),
    logger: new RecordingLogger(),
  }).execute({});
}

function twoSchools(): InMemoryDistrictOverviewReadModel {
  const readModel = new InMemoryDistrictOverviewReadModel();
  readModel.district = { id: 'd-1', name: 'Buchanan', countyId: 'c-1' };
  readModel.county = { id: 'c-1', name: 'Grand Bassa' };
  readModel.schools = [
    { id: 's-1', name: 'Alpha', code: 'A1', levels: ['PRIMARY'] },
    { id: 's-2', name: 'Beta', code: 'B1', levels: [] },
  ];
  return readModel;
}

describe('GetDeoDashboardUseCase', () => {
  it('returns an empty dashboard and reads nothing when no district is assigned', async () => {
    const readModel = twoSchools();
    const { data } = await run(readModel, { districtId: null });
    expect(data).toEqual({
      districtId: null,
      district: null,
      county: null,
      stats: { totalSchools: 0, totalStudents: 0, totalTeachers: 0, feeCompliance: 0 },
      alerts: [],
      alertSummary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
      schools: [],
      chartData: { enrollmentTrend: [], attendanceTrend: [], genderDistribution: { male: 0, female: 0 } },
    });
    expect(readModel.calls).toEqual([]);
  });

  it('names the district and its county', async () => {
    const { data } = await run(twoSchools());
    expect(data.districtId).toBe('d-1');
    expect(data.district).toEqual({ id: 'd-1', name: 'Buchanan' });
    expect(data.county).toEqual({ id: 'c-1', name: 'Grand Bassa' });
  });

  it('leaves the county out when its row was never synced', async () => {
    const readModel = twoSchools();
    readModel.county = null;
    const { data } = await run(readModel);
    expect(data.district).toEqual({ id: 'd-1', name: 'Buchanan' });
    expect(data.county).toBeNull();
  });

  it('keeps the district id when the district row was never synced', async () => {
    const readModel = twoSchools();
    readModel.district = null;
    const { data } = await run(readModel);
    expect(data.districtId).toBe('d-1');
    expect(data.district).toBeNull();
    expect(data.county).toBeNull();
    expect(readModel.argsOf('getCounty')).toBeUndefined();
  });

  it('totals schools, students and teachers from the per-school counts', async () => {
    const readModel = twoSchools();
    readModel.studentsBySchool = [
      { institutionId: 's-1', count: 120 },
      { institutionId: 's-2', count: 30 },
    ];
    readModel.teachersBySchool = [{ institutionId: 's-1', count: 5 }];
    const { data } = await run(readModel);
    expect(data.stats).toMatchObject({ totalSchools: 2, totalStudents: 150, totalTeachers: 5 });
    expect(data.schools.map((s) => [s.id, s.students, s.teachers])).toEqual([
      ['s-1', 120, 5],
      ['s-2', 30, 0],
    ]);
  });

  it('averages fee compliance over the schools that bill', async () => {
    const readModel = twoSchools();
    readModel.schools.push({ id: 's-3', name: 'Gamma', code: 'G1', levels: [] });
    const { data } = await run(readModel, {
      finance: [
        financeRow('s-1', 100, 80),
        financeRow('s-2', 50, 40),
        financeRow('s-3', 0, 0),
        financeRow('s-other-district', 900, 100),
      ],
    });
    expect(data.stats.feeCompliance).toBe(60);
    expect(data.schools.map((s) => s.feeCollectionRate)).toEqual([80, 40, null]);
  });

  it('reports 0 fee compliance when no school bills', async () => {
    const { data } = await run(twoSchools());
    expect(data.stats.feeCompliance).toBe(0);
    expect(data.schools.every((s) => s.feeCollectionRate === null)).toBe(true);
  });

  it('derives each school rate and standing from the 30-day window', async () => {
    const readModel = twoSchools();
    readModel.attendance = [{ institutionId: 's-1', records: 10, attended: 9 }];
    readModel.lastAttendance = [{ institutionId: 's-1', date: '2026-11-16' }];
    readModel.termSchools = ['s-1'];
    readModel.studentsBySchool = [{ institutionId: 's-1', count: 40 }];
    readModel.teachersBySchool = [{ institutionId: 's-1', count: 2 }];
    const { data } = await run(readModel);
    expect(readModel.argsOf('attendanceBySchool')).toEqual(['d-1', '2026-10-17']);
    expect(readModel.argsOf('schoolsWithRunningTerm')).toEqual(['d-1', '2026-11-16']);
    expect(data.schools[0]).toMatchObject({
      id: 's-1',
      name: 'Alpha',
      code: 'A1',
      levels: ['PRIMARY'],
      attendanceRate: 90,
      performanceStatus: 'Good',
      complianceStatus: 'Compliant',
    });
    // No attendance at all and no term running: missing, not zero.
    expect(data.schools[1]).toMatchObject({
      attendanceRate: null,
      performanceStatus: 'No Data',
      complianceStatus: 'Compliant',
    });
  });

  it('flags a school in term whose last attendance is over a week old, and not out of term', async () => {
    const readModel = twoSchools();
    readModel.lastAttendance = [
      { institutionId: 's-1', date: '2026-11-07' },
      { institutionId: 's-2', date: '2026-11-07' },
    ];
    readModel.termSchools = ['s-1'];
    const { data } = await run(readModel);
    expect(data.schools.map((s) => s.complianceStatus)).toEqual(['Flagged', 'Compliant']);
  });

  it('uses only the alerts raised against a school for that school', async () => {
    const readModel = twoSchools();
    readModel.alerts = [
      alert('a-1', 'CRITICAL', '2026-11-10T00:00:00.000Z', null),
      alert('a-2', 'HIGH', '2026-11-11T00:00:00.000Z', 's-2'),
    ];
    const { data } = await run(readModel);
    expect(data.schools.map((s) => s.complianceStatus)).toEqual(['Compliant', 'Needs Review']);
  });

  it('orders alerts worst first then newest, and summarises them all', async () => {
    const readModel = twoSchools();
    readModel.alerts = [
      alert('low-new', 'LOW', '2026-11-15T00:00:00.000Z'),
      alert('crit-old', 'CRITICAL', '2026-11-01T00:00:00.000Z'),
      alert('high', 'HIGH', '2026-11-05T00:00:00.000Z'),
      alert('crit-new', 'CRITICAL', '2026-11-12T00:00:00.000Z'),
      alert('medium', 'MEDIUM', '2026-11-06T00:00:00.000Z'),
    ];
    const { data } = await run(readModel);
    expect(data.alerts.map((a) => a.id)).toEqual(['crit-new', 'crit-old', 'high', 'medium', 'low-new']);
    expect(data.alertSummary).toEqual({ total: 5, critical: 2, high: 1, medium: 1, low: 1 });
  });

  it('lists at most 50 alerts while the summary counts them all', async () => {
    const readModel = twoSchools();
    readModel.alerts = Array.from({ length: 60 }, (_, i) =>
      alert(`a-${i}`, 'LOW', `2026-11-01T00:00:${String(i).padStart(2, '0')}.000Z`),
    );
    const { data } = await run(readModel);
    expect(data.alerts).toHaveLength(50);
    expect(data.alertSummary.total).toBe(60);
    expect(data.alertSummary.low).toBe(60);
  });

  it('builds a cumulative six-month enrollment trend', async () => {
    const readModel = twoSchools();
    readModel.studentsBySchool = [{ institutionId: 's-1', count: 6 }]; // 2 before the window + 4 inside it
    readModel.studentCreations = [
      { createdAt: '2026-02-15T12:00:00.000Z' }, // before the window
      { createdAt: '2026-06-15T12:00:00.000Z' },
      { createdAt: '2026-08-15T12:00:00.000Z' },
      { createdAt: '2026-08-20T12:00:00.000Z' },
      { createdAt: '2026-11-15T12:00:00.000Z' },
    ];
    const { data } = await run(readModel);
    expect(data.chartData.enrollmentTrend).toEqual([
      { period: 'Jun 2026', enrollment: 3 },
      { period: 'Jul 2026', enrollment: 3 },
      { period: 'Aug 2026', enrollment: 5 },
      { period: 'Sep 2026', enrollment: 5 },
      { period: 'Oct 2026', enrollment: 5 },
      { period: 'Nov 2026', enrollment: 6 },
    ]);
  });

  it('plots attendance per month, with 0 for a month without records', async () => {
    const readModel = twoSchools();
    readModel.attendanceMonths = [
      { month: '2026-09', records: 4, attended: 3 },
      { month: '2026-11', records: 10, attended: 10 },
    ];
    const { data } = await run(readModel);
    expect(readModel.argsOf('attendanceByMonth')).toEqual(['d-1', '2026-06-01']);
    expect(data.chartData.attendanceTrend).toEqual([
      { period: 'Jun 2026', rate: 0 },
      { period: 'Jul 2026', rate: 0 },
      { period: 'Aug 2026', rate: 0 },
      { period: 'Sep 2026', rate: 75 },
      { period: 'Oct 2026', rate: 0 },
      { period: 'Nov 2026', rate: 100 },
    ]);
  });

  it('counts male and female students', async () => {
    const readModel = twoSchools();
    readModel.studentsByGender = [
      { gender: 'MALE', count: 7 },
      { gender: 'FEMALE', count: 9 },
      { gender: 'OTHER', count: 1 },
    ];
    const { data } = await run(readModel);
    expect(data.chartData.genderDistribution).toEqual({ male: 7, female: 9 });
  });
});
