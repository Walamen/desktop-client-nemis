/** IPC wire shapes for the County (CEO) dashboard. Names and shapes mirror
 * Nemis `@nemis/types` (nemis.ts) so the components ported from portal-web
 * keep their bodies verbatim. Kept structurally identical to the
 * application-layer `CountyDashboardOutput` (which aliases this type). */
export interface EnrollmentByDistrictData {
  districtName: string;
  studentCount: number;
}

export interface CountyEnrollmentTrendData {
  period: string;
  enrollment: number;
  male: number;
  female: number;
}

export interface GenderDistributionData {
  male: number;
  female: number;
}

export interface AttendanceComplianceData {
  districtName: string;
  complianceRate: number;
}

export interface DropoutTrendData {
  period: string;
  dropouts: number;
}

export interface CountyChartData {
  enrollmentByDistrict: EnrollmentByDistrictData[];
  enrollmentTrend: CountyEnrollmentTrendData[];
  genderDistribution: GenderDistributionData;
  attendanceCompliance: AttendanceComplianceData[];
  dropoutTrend: DropoutTrendData[];
}

/** The fields of portal-web's `District` that DistrictScorecardCard reads. */
export interface CountyDistrict {
  id: string;
  name: string;
  _count?: { institutions?: number };
}

/** The fields of portal-web's `DashboardStats` the County dashboard reads. */
export interface CountyDashboardStats {
  totalSchools: number;
  totalStudents: number;
  totalTeachers: number;
}

export interface CountyDashboardResult {
  county: { id: string; name: string } | null;
  districts: { id: string; name: string; activeSchoolCount: number }[];
  stats: CountyDashboardStats;
  chartData: CountyChartData;
  byLevel: Record<string, number>;
}
