import type { CountySchoolFinanceRow, DeoSchoolRow } from '@nemis-desktop/types';
import type {
  DistrictAlertRow,
  IDistrictOverviewReadModel,
} from '../../interfaces/deo/district-overview-read-model';
import { daysBetween, schoolStanding, worstSeverity } from './school-standing';

const ATTENDANCE_WINDOW_DAYS = 30;

export interface DistrictSchoolRowsDeps {
  readModel: IDistrictOverviewReadModel;
  /** Per-school fee figures for each school's current academic year. */
  finance: { listSchools(): CountySchoolFinanceRow[] };
}

/** One row per active school of the district, as the DEO Dashboard and
 * Schools pages show it. The server builds the same rows for the web
 * (districts.service.ts computeSchoolStandings). */
export function buildDistrictSchoolRows(
  deps: DistrictSchoolRowsDeps,
  districtId: string,
  now: Date,
  openAlerts: readonly DistrictAlertRow[],
): DeoSchoolRow[] {
  const { readModel } = deps;
  const today = localDateIso(now);
  const students = byInstitution(readModel.countActiveStudentsBySchool(districtId), (row) => row.count);
  const teachers = byInstitution(readModel.countTeachingStaffBySchool(districtId), (row) => row.count);
  const attendance = byInstitution(
    readModel.attendanceBySchool(districtId, attendanceWindowStart(now)),
    (row) => row,
  );
  const lastAttendance = byInstitution(readModel.lastAttendanceDateBySchool(districtId), (row) => row.date);
  const inTerm = new Set(readModel.schoolsWithRunningTerm(districtId, today));
  const adminName = byInstitution(readModel.schoolAdminNameBySchool(districtId), (row) => row.name);
  const fees = byInstitution(deps.finance.listSchools(), (row) => row);
  const alertsBySchool = new Map<string, string[]>();
  for (const alert of openAlerts) {
    if (!alert.institutionId) continue;
    const severities = alertsBySchool.get(alert.institutionId) ?? [];
    severities.push(alert.severity);
    alertsBySchool.set(alert.institutionId, severities);
  }

  return readModel.listActiveSchools(districtId).map((school) => {
    const window = attendance.get(school.id);
    const last = lastAttendance.get(school.id);
    const activeStudents = students.get(school.id) ?? 0;
    const teachingStaff = teachers.get(school.id) ?? 0;
    const standing = schoolStanding({
      records30: window?.records ?? 0,
      attended30: window?.attended ?? 0,
      daysSinceAttendance: last ? daysBetween(last, today) : null,
      termRunning: inTerm.has(school.id),
      worstOpenAlert: worstSeverity(alertsBySchool.get(school.id) ?? []),
      activeStudents,
      teachingStaff,
    });
    const fee = fees.get(school.id);
    return {
      id: school.id,
      name: school.name,
      code: school.code,
      levels: school.levels,
      students: activeStudents,
      teachers: teachingStaff,
      attendanceRate: standing.attendanceRate,
      performanceStatus: standing.performanceStatus,
      complianceStatus: standing.complianceStatus,
      feeCollectionRate: fee && fee.totalExpected > 0 ? fee.collectionRate : null,
      principalName: adminName.get(school.id) ?? school.metadataPrincipal ?? null,
    };
  });
}

function byInstitution<Row extends { institutionId: string }, Value>(
  rows: readonly Row[],
  pick: (row: Row) => Value,
): Map<string, Value> {
  return new Map(rows.map((row) => [row.institutionId, pick(row)]));
}

/** First day (YYYY-MM-DD, local) of the 30-day attendance window every DEO
 * page reads, matching the server's computeSchoolStandings window. */
export function attendanceWindowStart(now: Date): string {
  return addDays(localDateIso(now), -ATTENDANCE_WINDOW_DAYS);
}

/** The device's local calendar date as YYYY-MM-DD. */
export function localDateIso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function addDays(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
