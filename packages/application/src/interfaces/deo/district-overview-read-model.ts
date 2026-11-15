export interface DistrictOverviewRef {
  readonly id: string;
  readonly name: string;
  readonly countyId: string;
}

export interface DistrictSchoolRef {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly levels: string[];
}

export interface DistrictAlertRow {
  readonly id: string;
  readonly type: string;
  readonly severity: string;
  readonly title: string;
  readonly description: string;
  readonly institutionId: string | null;
  readonly createdAt: string;
}

export interface DistrictReportRow {
  readonly id: string;
  readonly schoolId: string;
  readonly schoolName: string;
  readonly title: string;
  readonly type: string;
  readonly submittedAt: string;
}

/** Raw rows and counts for one district, read from this device's synced
 * database. No arithmetic here: GetDeoDashboardUseCase owns it.
 *
 * Every per-school method is limited to active institutions whose
 * districtId is the argument. "Active student" = students.isActive;
 * "teaching staff" = staff.isActive with position TEACHER or
 * ASSISTANT_TEACHER; "attended" = attendance status PRESENT or LATE.
 * Dates are YYYY-MM-DD. */
export interface IDistrictOverviewReadModel {
  /** Null when the district row was never synced (older server). */
  getDistrict(districtId: string): DistrictOverviewRef | null;
  /** Null when the county row was never synced (older server). */
  getCounty(countyId: string): { id: string; name: string } | null;
  /** Active schools, by name. */
  listActiveSchools(districtId: string): DistrictSchoolRef[];
  countActiveStudentsBySchool(districtId: string): { institutionId: string; count: number }[];
  countTeachingStaffBySchool(districtId: string): { institutionId: string; count: number }[];
  countActiveStudentsByGender(districtId: string): { gender: string; count: number }[];
  /** Active students with createdAt >= sinceIso (NULL createdAt excluded). */
  listActiveStudentCreations(districtId: string, sinceIso: string): { createdAt: string }[];
  /** Attendance dated on or after sinceDate, per school. */
  attendanceBySchool(districtId: string, sinceDate: string): { institutionId: string; records: number; attended: number }[];
  /** The latest attendance date per school; a school with none is absent. */
  lastAttendanceDateBySchool(districtId: string): { institutionId: string; date: string }[];
  /** Attendance dated on or after sinceDate, per month (`month` is YYYY-MM). */
  attendanceByMonth(districtId: string, sinceDate: string): { month: string; records: number; attended: number }[];
  /** Ids of schools with a term whose dates include `today`. */
  schoolsWithRunningTerm(districtId: string, today: string): string[];
  /** Unresolved alerts tagged with the district or raised against one of its
   * schools. County-level alerts are excluded. Unordered. */
  listOpenAlerts(districtId: string): DistrictAlertRow[];
  /** School reports with a submittedAt, newest first. */
  listSubmittedReports(districtId: string, limit: number): DistrictReportRow[];
  /** The newest submittedAt per school; a school with none is absent. */
  lastSubmissionBySchool(districtId: string): { institutionId: string; submittedAt: string }[];
}
