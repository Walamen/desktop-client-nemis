/**
 * County (CEO) Generate Reports page, computed on this device from synced data
 * (docs/superpowers/specs/2026-10-20-county-reports-enrollment-financial-design.md).
 * Shapes mirror portal-web's report types so the page ports one to one.
 */
export interface CountyReportOptions {
  county: { id: string; name: string; code: string | null } | null;
  /** Active own-county districts, by name. */
  districts: { id: string; name: string }[];
}

export interface CountyReportSchool {
  id: string;
  name: string;
}

/** No districtId = county-wide. */
export interface CountyEnrollmentReportQuery {
  districtId?: string;
  schoolId?: string;
}

export interface CountyEnrollmentSchoolRow {
  schoolId: string;
  schoolName: string;
  schoolCode: string;
  totalStudents: number;
  male: number;
  female: number;
  districtId: string | null;
  districtName: string | null;
}

export interface CountyEnrollmentDistrictRow {
  districtId: string;
  districtName: string;
  totalSchools: number;
  totalStudents: number;
  totalMale: number;
  totalFemale: number;
  genderRatio: string;
}

export interface CountyEnrollmentReport {
  reportType: 'ENROLLMENT';
  generatedAt: string;
  /** The chosen district, or the county itself when county-wide. */
  district: { id: string; name: string };
  summary: { totalSchools: number; totalStudents: number; totalMale: number; totalFemale: number; genderRatio: string };
  /** County-wide only. */
  byDistrict?: CountyEnrollmentDistrictRow[];
  bySchool: CountyEnrollmentSchoolRow[];
  byGradeLevel: { gradeLevel: string; male: number; female: number; total: number }[];
  trendData: { month: string; count: number }[];
}
