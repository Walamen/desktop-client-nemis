import type {
  CountySchoolFinanceRow,
  DeoAlert,
  DeoAlertSummary,
  DeoChartData,
  DeoDashboardResult,
  DeoSchoolRow,
} from '@nemis-desktop/types';
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type {
  DistrictAlertRow,
  IDistrictOverviewReadModel,
} from '../../interfaces/deo/district-overview-read-model';
import type { IClock } from '../../interfaces/clock';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import { buildDistrictSchoolRows, localDateIso } from './district-school-rows';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SEVERITY_RANK: Readonly<Record<string, number>> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const TREND_MONTHS = 6;
const MAX_ALERTS = 50;
const MAX_SUBMISSIONS = 50;

export interface GetDeoDashboardDeps {
  readModel: IDistrictOverviewReadModel;
  /** Per-school fee figures for each school's current academic year. The
   * County finance read model serves: a district device holds only its
   * district's fee ledger. */
  finance: { listSchools(): CountySchoolFinanceRow[] };
  /** The signed-in officer's district; null when none is assigned. */
  currentDistrictId: string | null;
  clock: IClock;
  logger: IAppLogger;
}

/** The DEO dashboard, computed on this device from synced data. The rules
 * are in docs/superpowers/specs/2026-11-15-deo-dashboard-design.md; the
 * server computes the same for the web (districts.service.ts). */
export class GetDeoDashboardUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<DeoDashboardResult>
> {
  constructor(private readonly deps: GetDeoDashboardDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<DeoDashboardResult>> {
    return invokeUseCase('GetDeoDashboard', this.deps.logger, async () => {
      const districtId = this.deps.currentDistrictId;
      if (!districtId) return ok(emptyDashboard());

      const { readModel } = this.deps;
      const now = new Date(this.deps.clock.now());
      const district = readModel.getDistrict(districtId);
      const county = district ? readModel.getCounty(district.countyId) : null;

      const openAlerts = readModel.listOpenAlerts(districtId);
      const schools = buildDistrictSchoolRows(this.deps, districtId, now, openAlerts);
      const billing = schools.filter(
        (school): school is DeoSchoolRow & { feeCollectionRate: number } => school.feeCollectionRate !== null,
      );
      const totalStudents = sum(schools.map((school) => school.students));
      const byGender = readModel.countActiveStudentsByGender(districtId);

      return ok({
        districtId,
        district: district ? { id: district.id, name: district.name } : null,
        county,
        stats: {
          totalSchools: schools.length,
          totalStudents,
          totalTeachers: sum(schools.map((school) => school.teachers)),
          // A school that bills nothing is not a school that collects nothing.
          feeCompliance:
            billing.length > 0
              ? Math.round(sum(billing.map((school) => school.feeCollectionRate)) / billing.length)
              : 0,
        },
        alerts: sortAlerts(openAlerts).slice(0, MAX_ALERTS),
        alertSummary: summarise(openAlerts),
        schools,
        chartData: {
          enrollmentTrend: enrollmentTrend(now, totalStudents, districtId, readModel),
          attendanceTrend: attendanceTrend(now, districtId, readModel),
          genderDistribution: { male: countFor(byGender, 'MALE'), female: countFor(byGender, 'FEMALE') },
        },
        submissions: readModel
          .listSubmittedReports(districtId, MAX_SUBMISSIONS)
          .map(({ id, schoolName, title, type, submittedAt }) => ({ id, schoolName, title, type, submittedAt })),
      });
    });
  }
}

function emptyDashboard(): DeoDashboardResult {
  return {
    districtId: null,
    district: null,
    county: null,
    stats: { totalSchools: 0, totalStudents: 0, totalTeachers: 0, feeCompliance: 0 },
    alerts: [],
    alertSummary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
    schools: [],
    chartData: { enrollmentTrend: [], attendanceTrend: [], genderDistribution: { male: 0, female: 0 } },
    submissions: [],
  };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function countFor(rows: readonly { gender: string; count: number }[], gender: string): number {
  return rows.find((row) => row.gender === gender)?.count ?? 0;
}

/** Worst severity first, then newest. An unknown severity sorts last. */
function sortAlerts(alerts: readonly DistrictAlertRow[]): DeoAlert[] {
  const rank = (severity: string) => SEVERITY_RANK[severity.toUpperCase()] ?? 99;
  return [...alerts].sort(
    (a, b) => rank(a.severity) - rank(b.severity) || b.createdAt.localeCompare(a.createdAt),
  );
}

function summarise(alerts: readonly DistrictAlertRow[]): DeoAlertSummary {
  const count = (severity: string) => alerts.filter((alert) => alert.severity.toUpperCase() === severity).length;
  return {
    total: alerts.length,
    critical: count('CRITICAL'),
    high: count('HIGH'),
    medium: count('MEDIUM'),
    low: count('LOW'),
  };
}

/** The first day (local) of each of the last six months, oldest first. Built
 * from year and month so a 31st can never overflow into the next month. */
function trendMonths(now: Date): Date[] {
  return Array.from(
    { length: TREND_MONTHS },
    (_, i) => new Date(now.getFullYear(), now.getMonth() - (TREND_MONTHS - 1) + i, 1),
  );
}

function periodLabel(month: Date): string {
  return `${MONTH_NAMES[month.getMonth()] ?? ''} ${month.getFullYear()}`;
}

/** Cumulative active students per month. Students created before the window,
 * or with no creation date, form the starting figure. */
export function enrollmentTrend(
  now: Date,
  totalStudents: number,
  districtId: string,
  readModel: IDistrictOverviewReadModel,
): DeoChartData['enrollmentTrend'] {
  const months = trendMonths(now);
  const windowStart = months[0];
  if (!windowStart) return [];
  const created = readModel
    .listActiveStudentCreations(districtId, windowStart.toISOString())
    .map((row) => new Date(row.createdAt).getTime());

  let enrollment = totalStudents - created.length;
  return months.map((month) => {
    const next = new Date(month.getFullYear(), month.getMonth() + 1, 1).getTime();
    enrollment += created.filter((at) => at >= month.getTime() && at < next).length;
    return { period: periodLabel(month), enrollment };
  });
}

/** Attended over all records per month; a month with no records plots 0. */
function attendanceTrend(
  now: Date,
  districtId: string,
  readModel: IDistrictOverviewReadModel,
): DeoChartData['attendanceTrend'] {
  const months = trendMonths(now);
  const windowStart = months[0];
  if (!windowStart) return [];
  const byMonth = new Map(
    readModel.attendanceByMonth(districtId, localDateIso(windowStart)).map((row) => [row.month, row]),
  );
  return months.map((month) => {
    const row = byMonth.get(localDateIso(month).slice(0, 7));
    return {
      period: periodLabel(month),
      rate: row && row.records > 0 ? Math.round((row.attended / row.records) * 100) : 0,
    };
  });
}
