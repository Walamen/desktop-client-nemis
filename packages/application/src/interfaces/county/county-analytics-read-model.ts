export interface CountyRef {
  readonly id: string;
  readonly name: string;
}

export interface CountyDistrictRow {
  readonly id: string;
  readonly name: string;
  readonly activeSchoolCount: number;
}

/** Raw county-wide aggregates for the County (CEO) dashboard, read from this
 * device's synced database (a County device holds exactly its county).
 * "Active student" = students.isActive in an institution with isActive;
 * "active teacher" = staff.isActive in an active institution — the same
 * filters as Nemis/apps/Server counties.service.ts. No business math here:
 * GetCountyDashboardUseCase owns it. */
export interface ICountyAnalyticsReadModel {
  getCounty(): CountyRef | null;
  /** Active districts, by name, each with its active-school count. */
  listActiveDistricts(): CountyDistrictRow[];
  countActiveSchools(): number;
  countActiveStudents(): number;
  countActiveTeachers(): number;
  countActiveStudentsByGender(): { gender: string; count: number }[];
  /** Non-null grade levels only. */
  countActiveStudentsByGradeLevel(): { gradeLevel: string; count: number }[];
  /** Grouped by district name, ordered by name; district-less students excluded. */
  countActiveStudentsByDistrict(): { districtName: string; count: number }[];
  /** Active students with createdAt >= sinceIso (NULL createdAt excluded). */
  listActiveStudentCreations(sinceIso: string): { createdAt: string; gender: string }[];
  /** One row per active institution; totalStudentCount counts ALL its
   * students (active or not), exactly as the server's coverage query does. */
  listActiveSchoolsForCoverage(): { districtName: string | null; totalStudentCount: number }[];
}
