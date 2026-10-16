import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../testing/fixed-clock';
import { RecordingLogger } from '../../testing/recording-logger';
import { InMemoryCountyAnalyticsReadModel } from '../../testing/county/in-memory-county-analytics-read-model';
import { GetCountyDashboardUseCase } from './get-county-dashboard';

// Mid-month, midday UTC: the same calendar day in every timezone within ±11h,
// so the server's local-time month arithmetic gives the same buckets in CI
// and on Alvin's machine.
const NOW = '2026-10-16T12:00:00.000Z';

function run(readModel: InMemoryCountyAnalyticsReadModel, now = NOW) {
  return new GetCountyDashboardUseCase({
    readModel,
    clock: new FixedClock(now),
    logger: new RecordingLogger(),
  }).execute({});
}

describe('GetCountyDashboardUseCase', () => {
  it('passes the county, districts and stats through', async () => {
    const readModel = new InMemoryCountyAnalyticsReadModel();
    readModel.county = { id: 'county-1', name: 'Grand Bassa' };
    readModel.districts = [{ id: 'd-1', name: 'Buchanan', activeSchoolCount: 2 }];
    readModel.activeSchools = 2;
    readModel.activeStudents = 7;
    readModel.activeTeachers = 3;
    const { data } = await run(readModel);
    expect(data.county).toEqual({ id: 'county-1', name: 'Grand Bassa' });
    expect(data.districts).toEqual([{ id: 'd-1', name: 'Buchanan', activeSchoolCount: 2 }]);
    expect(data.stats).toEqual({ totalSchools: 2, totalStudents: 7, totalTeachers: 3 });
  });

  it('builds the cumulative 12-month trend exactly like the server', async () => {
    const readModel = new InMemoryCountyAnalyticsReadModel();
    readModel.activeStudents = 6; // 2 before the window (one with NULL createdAt) + 4 inside it
    readModel.studentCreations = [
      { createdAt: '2025-06-15T12:00:00.000Z', gender: 'MALE' }, // before the window
      { createdAt: '2025-11-15T12:00:00.000Z', gender: 'MALE' },
      { createdAt: '2026-03-15T12:00:00.000Z', gender: 'FEMALE' },
      { createdAt: '2026-03-20T12:00:00.000Z', gender: 'MALE' },
      { createdAt: '2026-10-10T12:00:00.000Z', gender: 'FEMALE' },
    ];
    const { data } = await run(readModel);
    const trend = data.chartData.enrollmentTrend;
    expect(trend).toHaveLength(12);
    expect(trend.map((m) => m.period)).toEqual([
      'Nov 2025', 'Dec 2025', 'Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026',
      'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026', 'Oct 2026',
    ]);
    // enrollment carries the pre-window base (6 - 4 = 2); male/female count
    // only students created inside the window — the server's rule.
    expect(trend[0]).toEqual({ period: 'Nov 2025', enrollment: 3, male: 1, female: 0 });
    expect(trend[3]).toEqual({ period: 'Feb 2026', enrollment: 3, male: 1, female: 0 });
    expect(trend[4]).toEqual({ period: 'Mar 2026', enrollment: 5, male: 2, female: 1 });
    expect(trend[11]).toEqual({ period: 'Oct 2026', enrollment: 6, male: 2, female: 2 });
  });

  it('puts every student without a createdAt into the pre-window base', async () => {
    // A County device that synced before migration 031: no createdAt at all.
    const readModel = new InMemoryCountyAnalyticsReadModel();
    readModel.activeStudents = 40;
    const { data } = await run(readModel);
    expect(data.chartData.enrollmentTrend).toHaveLength(12);
    expect(data.chartData.enrollmentTrend.every((m) => m.enrollment === 40 && m.male === 0 && m.female === 0)).toBe(true);
  });

  it('computes coverage per district name, rounding, and skipping schools with no district', async () => {
    const readModel = new InMemoryCountyAnalyticsReadModel();
    readModel.schoolsForCoverage = [
      { districtName: 'Buchanan', totalStudentCount: 10 },
      { districtName: 'Buchanan', totalStudentCount: 0 },
      { districtName: 'Buchanan', totalStudentCount: 3 },
      { districtName: 'Owensgrove', totalStudentCount: 0 },
      { districtName: null, totalStudentCount: 50 },
    ];
    const { data } = await run(readModel);
    expect(data.chartData.attendanceCompliance).toEqual([
      { districtName: 'Buchanan', complianceRate: 67 },
      { districtName: 'Owensgrove', complianceRate: 0 },
    ]);
  });

  it('maps grade levels to school levels and drops unmapped ones', async () => {
    const readModel = new InMemoryCountyAnalyticsReadModel();
    readModel.studentsByGradeLevel = [
      { gradeLevel: 'KG', count: 2 },
      { gradeLevel: 'K2', count: 1 },
      { gradeLevel: 'GRADE_1', count: 5 },
      { gradeLevel: 'GRADE_9', count: 4 },
      { gradeLevel: 'GRADE_10', count: 3 },
      { gradeLevel: 'GRADE_12', count: 1 },
      { gradeLevel: 'UNKNOWN', count: 9 },
    ];
    const { data } = await run(readModel);
    expect(data.byLevel).toEqual({ PRE_PRIMARY: 3, PRIMARY: 9, SECONDARY: 4 });
  });

  it('builds gender distribution and enrollment by district, and an empty dropout trend', async () => {
    const readModel = new InMemoryCountyAnalyticsReadModel();
    readModel.studentsByGender = [
      { gender: 'MALE', count: 4 },
      { gender: 'FEMALE', count: 5 },
      { gender: 'OTHER', count: 1 },
    ];
    readModel.studentsByDistrict = [{ districtName: 'Buchanan', count: 9 }];
    const { data } = await run(readModel);
    expect(data.chartData.genderDistribution).toEqual({ male: 4, female: 5 });
    expect(data.chartData.enrollmentByDistrict).toEqual([{ districtName: 'Buchanan', studentCount: 9 }]);
    expect(data.chartData.dropoutTrend).toEqual([]);
  });

  it('returns a null county when none has synced', async () => {
    const { data } = await run(new InMemoryCountyAnalyticsReadModel());
    expect(data.county).toBeNull();
  });
});
