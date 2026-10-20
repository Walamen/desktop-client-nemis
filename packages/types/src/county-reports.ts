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

export type CountyAttendancePeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface CountyAttendanceReportQuery extends CountyEnrollmentReportQuery {
  /** Defaults to WEEKLY (last 28 days). */
  period?: CountyAttendancePeriod;
}

export interface CountyAttendanceReport {
  reportType: 'ATTENDANCE';
  generatedAt: string;
  district: { id: string; name: string };
  period: { start: string; end: string; type: CountyAttendancePeriod };
  /** Rates count PRESENT and LATE as attended. */
  summary: {
    totalSchools: number;
    totalRecords: number;
    presentCount: number;
    absentCount: number;
    lateCount: number;
    overallAttendanceRate: number;
  };
  bySchool: {
    schoolId: string;
    schoolName: string;
    schoolCode: string;
    totalStudents: number;
    recordsCount: number;
    present: number;
    absent: number;
    late: number;
    attendanceRate: number;
    districtId: string | null;
    districtName: string | null;
  }[];
  /** The last 14 dates with records, oldest first. */
  trendData: { date: string; rate: number; present: number; absent: number }[];
}

export interface CountyAcademicReport {
  reportType: 'ACADEMIC';
  generatedAt: string;
  district: { id: string; name: string };
  /** Published grades in each school's current academic year. */
  summary: {
    totalSchools: number;
    totalGrades: number;
    averageScore: number;
    passRate: number;
    passCount: number;
    failCount: number;
  };
  bySubject: { subjectId: string; subjectName: string; totalGrades: number; averageScore: number; passRate: number }[];
  bySchool: {
    schoolId: string;
    schoolName: string;
    schoolCode: string;
    totalGrades: number;
    averageScore: number;
    passRate: number;
    districtId: string | null;
    districtName: string | null;
  }[];
}

export interface CountyStaffComplianceReport {
  reportType: 'STAFF_COMPLIANCE';
  generatedAt: string;
  district: { id: string; name: string };
  summary: {
    totalSchools: number;
    totalStudents: number;
    totalStaff: number;
    totalTeachers: number;
    qualifiedTeachers: number;
    qualificationRate: number;
    overallTeacherStudentRatio: string;
  };
  complianceStatus: { compliant: number; nonCompliant: number; total: number; complianceRate: number };
  bySchool: {
    schoolId: string;
    schoolName: string;
    schoolCode: string;
    totalStudents: number;
    totalStaff: number;
    totalTeachers: number;
    qualifiedTeachers: number;
    teacherStudentRatio: string;
    isCompliant: boolean;
    districtId: string | null;
    districtName: string | null;
  }[];
}
