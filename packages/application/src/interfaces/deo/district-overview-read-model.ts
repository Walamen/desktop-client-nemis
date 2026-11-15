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
  /** The profile's principal (contact.principal, then principalName). */
  readonly metadataPrincipal?: string | null;
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

/** One School Admin account at one school, before the school's issues are joined in. */
export interface DistrictSchoolAdminRow {
  readonly userId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly photoUrl: string | null;
  readonly schoolId: string;
  readonly schoolName: string;
  readonly employeeNumber: string | null;
  readonly isActive: boolean;
  readonly joinedAt: string | null;
  readonly lastLoginAt: string | null;
  readonly reportsThisMonth: number;
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
  /** The first active School Admin of each school (by id), full name. */
  schoolAdminNameBySchool(districtId: string): { institutionId: string; name: string }[];
  /** Each month (YYYY-MM) on or after sinceDate in which a school submitted
   * a report; one row per school and month. */
  reportMonthsBySchool(districtId: string, sinceDate: string): { institutionId: string; month: string }[];
  /** Every School Admin of an active school of the district. reportsThisMonth
   * counts reports the admin submitted for that school with
   * monthStartIso <= submittedAt < nextMonthIso. Unordered. */
  listSchoolAdmins(districtId: string, monthStartIso: string, nextMonthIso: string): DistrictSchoolAdminRow[];
  /** Unresolved INFRASTRUCTURE_ISSUE alerts per school, school staff
   * requests excluded; a school with none is absent. */
  countOpenInfrastructureIssuesBySchool(districtId: string): { institutionId: string; count: number }[];
}
