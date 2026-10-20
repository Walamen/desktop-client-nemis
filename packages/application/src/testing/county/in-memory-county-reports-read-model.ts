import type { CountyAttendancePeriod, CountyEnrollmentReportQuery, CountyReportSchool } from '@nemis-desktop/types';
import type {
  CountyAcademicReportData,
  CountyAttendanceReportData,
  CountyEnrollmentReportData,
  CountyStaffComplianceReportData,
  ICountyReportsReadModel,
} from '../../interfaces/county/county-reports-read-model';

/** Settable canned report data; records the last calls. */
export class InMemoryCountyReportsReadModel implements ICountyReportsReadModel {
  options: { countyCode: string | null; districts: { id: string; name: string }[] } = { countyCode: null, districts: [] };
  schoolsByDistrict = new Map<string, CountyReportSchool[]>();
  enrollment: CountyEnrollmentReportData = {
    reportType: 'ENROLLMENT',
    scopeName: null,
    summary: { totalSchools: 0, totalStudents: 0, totalMale: 0, totalFemale: 0, genderRatio: 'N/A' },
    bySchool: [],
    byGradeLevel: [],
    trendData: [],
  };
  attendance: CountyAttendanceReportData = {
    reportType: 'ATTENDANCE',
    scopeName: null,
    period: { start: '', end: '', type: 'WEEKLY' },
    summary: { totalSchools: 0, totalRecords: 0, presentCount: 0, absentCount: 0, lateCount: 0, overallAttendanceRate: 0 },
    bySchool: [],
    trendData: [],
  };
  academic: CountyAcademicReportData = {
    reportType: 'ACADEMIC',
    scopeName: null,
    summary: { totalSchools: 0, totalGrades: 0, averageScore: 0, passRate: 0, passCount: 0, failCount: 0 },
    bySubject: [],
    bySchool: [],
  };
  staff: CountyStaffComplianceReportData = {
    reportType: 'STAFF_COMPLIANCE',
    scopeName: null,
    summary: {
      totalSchools: 0,
      totalStudents: 0,
      totalStaff: 0,
      totalTeachers: 0,
      qualifiedTeachers: 0,
      qualificationRate: 0,
      overallTeacherStudentRatio: 'N/A',
    },
    complianceStatus: { compliant: 0, nonCompliant: 0, total: 0, complianceRate: 0 },
    bySchool: [],
  };
  /** When set, getEnrollmentReport throws it. */
  enrollmentError: Error | null = null;
  /** When set, getAcademicReport throws it. */
  academicError: Error | null = null;
  lastEnrollmentQuery: CountyEnrollmentReportQuery | null = null;
  lastAttendanceQuery: (CountyEnrollmentReportQuery & { period: CountyAttendancePeriod }) | null = null;
  lastAcademicQuery: CountyEnrollmentReportQuery | null = null;
  lastStaffQuery: CountyEnrollmentReportQuery | null = null;
  lastNowIso: string | null = null;

  getOptions() {
    return this.options;
  }

  listSchools(districtId: string): CountyReportSchool[] {
    return this.schoolsByDistrict.get(districtId) ?? [];
  }

  getEnrollmentReport(query: CountyEnrollmentReportQuery, nowIso: string): CountyEnrollmentReportData {
    if (this.enrollmentError) throw this.enrollmentError;
    this.lastEnrollmentQuery = query;
    this.lastNowIso = nowIso;
    return this.enrollment;
  }

  getAttendanceReport(
    query: CountyEnrollmentReportQuery & { period: CountyAttendancePeriod },
    nowIso: string,
  ): CountyAttendanceReportData {
    this.lastAttendanceQuery = query;
    this.lastNowIso = nowIso;
    return this.attendance;
  }

  getAcademicReport(query: CountyEnrollmentReportQuery): CountyAcademicReportData {
    if (this.academicError) throw this.academicError;
    this.lastAcademicQuery = query;
    return this.academic;
  }

  getStaffComplianceReport(query: CountyEnrollmentReportQuery): CountyStaffComplianceReportData {
    this.lastStaffQuery = query;
    return this.staff;
  }
}
