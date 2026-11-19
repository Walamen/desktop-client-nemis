import type { DeoDropoutAlert, DeoSchoolRow, DeoStudentsResult } from '@nemis-desktop/types';
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { IClock } from '../../interfaces/clock';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import { attendanceWindowStart, buildDistrictSchoolRows, type DistrictSchoolRowsDeps } from './district-school-rows';
import { enrollmentTrend } from './get-deo-dashboard';
import { LOW_ATTENDANCE_RATE } from './pupil-risk';

export interface GetDeoStudentsDeps extends DistrictSchoolRowsDeps {
  /** The signed-in officer's district; null when none is assigned. */
  currentDistrictId: string | null;
  clock: IClock;
  logger: IAppLogger;
}

/** DEO Students & Enrollment, from this device. The rows are the shared
 * school rows (buildDistrictSchoolRows), so standings match the Dashboard and
 * Schools pages. Rules: docs/superpowers/specs/2026-11-15-deo-students-design.md;
 * the server builds the same (districts.service.ts getDistrictStudentEnrollment). */
export class GetDeoStudentsUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<DeoStudentsResult>
> {
  constructor(private readonly deps: GetDeoStudentsDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<DeoStudentsResult>> {
    return invokeUseCase('GetDeoStudents', this.deps.logger, async () => {
      const districtId = this.deps.currentDistrictId;
      if (!districtId) return ok(emptyResult());
      const { readModel } = this.deps;
      const now = new Date(this.deps.clock.now());
      const district = readModel.getDistrict(districtId);
      const county = district ? readModel.getCounty(district.countyId) : null;

      const rows = buildDistrictSchoolRows(this.deps, districtId, now, readModel.listOpenAlerts(districtId));
      const since = attendanceWindowStart(now);
      let records = 0;
      let attended = 0;
      for (const row of readModel.attendanceBySchool(districtId, since)) {
        records += row.records;
        attended += row.attended;
      }
      const atRisk = new Map(
        readModel.countAtRiskStudentsBySchool(districtId, since).map((row) => [row.institutionId, row.count]),
      );
      const byGender = readModel.countActiveStudentsByGender(districtId);
      const gender = {
        male: byGender.find((row) => row.gender === 'MALE')?.count ?? 0,
        female: byGender.find((row) => row.gender === 'FEMALE')?.count ?? 0,
      };
      const totalEnrollment = rows.reduce((sum, row) => sum + row.students, 0);

      return ok({
        districtId,
        district: district ? { id: district.id, name: district.name } : null,
        county,
        summary: {
          totalEnrollment,
          ...gender,
          avgAttendance: records > 0 ? Math.round((attended / records) * 100) : null,
        },
        enrollmentTrend: enrollmentTrend(now, totalEnrollment, districtId, readModel),
        genderDistribution: gender,
        schools: rows.map((row) => ({
          id: row.id,
          name: row.name,
          code: row.code,
          levels: row.levels,
          students: row.students,
          teachers: row.teachers,
          attendanceRate: row.attendanceRate,
          performanceStatus: row.performanceStatus,
        })),
        dropoutAlerts: dropoutAlerts(rows, atRisk),
      });
    });
  }
}

function isLow(rate: number | null): rate is number {
  return rate !== null && rate < LOW_ATTENDANCE_RATE;
}

/** Schools with pupils that are low or flagged; worst rate
 * first, no data last, then by name. */
function dropoutAlerts(rows: readonly DeoSchoolRow[], atRisk: ReadonlyMap<string, number>): DeoDropoutAlert[] {
  return rows
    .filter(
      (row) => row.students > 0 && (isLow(row.attendanceRate) || row.complianceStatus === 'Flagged'),
    )
    .sort(
      (a, b) =>
        (a.attendanceRate ?? Number.POSITIVE_INFINITY) - (b.attendanceRate ?? Number.POSITIVE_INFINITY) ||
        a.name.localeCompare(b.name),
    )
    .map((row) => ({
      schoolId: row.id,
      schoolName: row.name,
      attendanceRate: row.attendanceRate,
      reason: isLow(row.attendanceRate)
        ? `Attendance is ${row.attendanceRate}%`
        : 'Flagged in district monitoring',
      atRiskStudents: atRisk.get(row.id) ?? 0,
    }));
}

function emptyResult(): DeoStudentsResult {
  return {
    districtId: null,
    district: null,
    county: null,
    summary: { totalEnrollment: 0, male: 0, female: 0, avgAttendance: null },
    enrollmentTrend: [],
    genderDistribution: { male: 0, female: 0 },
    schools: [],
    dropoutAlerts: [],
  };
}
