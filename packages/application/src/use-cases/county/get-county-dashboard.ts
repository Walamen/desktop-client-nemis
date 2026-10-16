import type {
  AttendanceComplianceData,
  CountyEnrollmentTrendData,
} from '@nemis-desktop/types';
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { CountyDashboardOutput } from '../../dto/county/county-dashboard-dto';
import type { ICountyAnalyticsReadModel } from '../../interfaces/county/county-analytics-read-model';
import type { IClock } from '../../interfaces/clock';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Nemis/apps/Server counties.service.ts getStudentStats() GRADE_TO_LEVEL. */
const GRADE_TO_LEVEL: Readonly<Record<string, string>> = {
  KG: 'PRE_PRIMARY',
  K1: 'PRE_PRIMARY',
  K2: 'PRE_PRIMARY',
  GRADE_1: 'PRIMARY',
  GRADE_2: 'PRIMARY',
  GRADE_3: 'PRIMARY',
  GRADE_4: 'PRIMARY',
  GRADE_5: 'PRIMARY',
  GRADE_6: 'PRIMARY',
  GRADE_7: 'PRIMARY',
  GRADE_8: 'PRIMARY',
  GRADE_9: 'PRIMARY',
  GRADE_10: 'SECONDARY',
  GRADE_11: 'SECONDARY',
  GRADE_12: 'SECONDARY',
};

export interface GetCountyDashboardDeps {
  readModel: ICountyAnalyticsReadModel;
  clock: IClock;
  logger: IAppLogger;
}

/** The County (CEO) dashboard, computed locally with the formulas of
 * Nemis/apps/Server counties.service.ts (getStats, getChartData,
 * getStudentStats) and districts.service.ts findAll — quirks included, for
 * parity with portal-web (see the design spec's Background section). */
export class GetCountyDashboardUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<CountyDashboardOutput>
> {
  constructor(private readonly deps: GetCountyDashboardDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<CountyDashboardOutput>> {
    return invokeUseCase('GetCountyDashboard', this.deps.logger, async () => {
      const readModel = this.deps.readModel;
      const totalStudents = readModel.countActiveStudents();
      const byGender = readModel.countActiveStudentsByGender();
      return ok({
        county: readModel.getCounty(),
        districts: readModel.listActiveDistricts(),
        stats: {
          totalSchools: readModel.countActiveSchools(),
          totalStudents,
          totalTeachers: readModel.countActiveTeachers(),
        },
        chartData: {
          enrollmentByDistrict: readModel
            .countActiveStudentsByDistrict()
            .map(({ districtName, count }) => ({ districtName, studentCount: count })),
          enrollmentTrend: enrollmentTrend(new Date(this.deps.clock.now()), totalStudents, readModel),
          genderDistribution: {
            male: countFor(byGender, 'MALE'),
            female: countFor(byGender, 'FEMALE'),
          },
          attendanceCompliance: coverage(readModel.listActiveSchoolsForCoverage()),
          dropoutTrend: [],
        },
        byLevel: byLevel(readModel.countActiveStudentsByGradeLevel()),
      });
    });
  }
}

function countFor(rows: { gender: string; count: number }[], gender: string): number {
  return rows.find((row) => row.gender === gender)?.count ?? 0;
}

/** Same local-time Date arithmetic as the server, in the same order
 * (setMonth before setDate(1)) — see the spec's Out of scope note. */
function enrollmentTrend(
  now: Date,
  totalStudents: number,
  readModel: ICountyAnalyticsReadModel,
): CountyEnrollmentTrendData[] {
  const windowStart = new Date(now);
  windowStart.setMonth(now.getMonth() - 11);
  windowStart.setDate(1);
  windowStart.setHours(0, 0, 0, 0);

  const created = readModel
    .listActiveStudentCreations(windowStart.toISOString())
    .map((row) => ({ at: new Date(row.createdAt).getTime(), gender: row.gender }));

  // Students created before the window (or with no createdAt) start the count.
  let enrollment = totalStudents - created.length;
  let male = 0;
  let female = 0;
  const trend: CountyEnrollmentTrendData[] = [];
  for (let i = 0; i < 12; i += 1) {
    const date = new Date(windowStart);
    date.setMonth(date.getMonth() + i);
    const monthStart = new Date(date);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(date);
    monthEnd.setMonth(monthEnd.getMonth() + 1);
    monthEnd.setDate(0);
    monthEnd.setHours(23, 59, 59, 999);

    const inMonth = created.filter(
      (row) => row.at >= monthStart.getTime() && row.at <= monthEnd.getTime(),
    );
    enrollment += inMonth.length;
    male += inMonth.filter((row) => row.gender === 'MALE').length;
    female += inMonth.filter((row) => row.gender === 'FEMALE').length;
    trend.push({
      period: `${MONTH_NAMES[date.getMonth()] ?? ''} ${date.getFullYear()}`,
      enrollment,
      male,
      female,
    });
  }
  return trend;
}

/** "Attendance compliance" on the web is enrollment coverage: % of active
 * schools per district with at least one student. */
function coverage(
  rows: { districtName: string | null; totalStudentCount: number }[],
): AttendanceComplianceData[] {
  const byDistrict = new Map<string, { total: number; withStudents: number }>();
  for (const row of rows) {
    if (!row.districtName) continue;
    const entry = byDistrict.get(row.districtName) ?? { total: 0, withStudents: 0 };
    entry.total += 1;
    if (row.totalStudentCount > 0) entry.withStudents += 1;
    byDistrict.set(row.districtName, entry);
  }
  return [...byDistrict].map(([districtName, entry]) => ({
    districtName,
    complianceRate: entry.total > 0 ? Math.round((entry.withStudents / entry.total) * 100) : 0,
  }));
}

function byLevel(rows: { gradeLevel: string; count: number }[]): Record<string, number> {
  const levels: Record<string, number> = {};
  for (const { gradeLevel, count } of rows) {
    const level = GRADE_TO_LEVEL[gradeLevel];
    if (level) levels[level] = (levels[level] ?? 0) + count;
  }
  return levels;
}
