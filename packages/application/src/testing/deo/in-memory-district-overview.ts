import type {
  DistrictAlertRow,
  DistrictSchoolAdminRow,
  DistrictTeacherRow,
  DistrictOverviewRef,
  DistrictReportRow,
  DistrictSchoolRef,
  IDistrictOverviewReadModel,
} from '../../interfaces/deo/district-overview-read-model';
import type { IDistrictAlertStore } from '../../interfaces/deo/district-alert-store';

/** Settable canned rows. `calls` records every method name with its
 * arguments, so a test can prove what was (or was not) asked. */
export class InMemoryDistrictOverviewReadModel implements IDistrictOverviewReadModel {
  district: DistrictOverviewRef | null = null;
  county: { id: string; name: string } | null = null;
  schools: DistrictSchoolRef[] = [];
  studentsBySchool: { institutionId: string; count: number }[] = [];
  teachersBySchool: { institutionId: string; count: number }[] = [];
  studentsByGender: { gender: string; count: number }[] = [];
  studentCreations: { createdAt: string }[] = [];
  attendance: { institutionId: string; records: number; attended: number }[] = [];
  lastAttendance: { institutionId: string; date: string }[] = [];
  attendanceMonths: { month: string; records: number; attended: number }[] = [];
  termSchools: string[] = [];
  alerts: DistrictAlertRow[] = [];
  reports: DistrictReportRow[] = [];
  lastSubmissions: { institutionId: string; submittedAt: string }[] = [];
  schoolAdmins: { institutionId: string; name: string }[] = [];
  reportMonths: { institutionId: string; month: string }[] = [];
  schoolAdminRows: DistrictSchoolAdminRow[] = [];
  infrastructureIssues: { institutionId: string; count: number }[] = [];
  teacherRows: DistrictTeacherRow[] = [];
  atRiskStudents: { institutionId: string; count: number }[] = [];
  readonly calls: { method: string; args: unknown[] }[] = [];

  #record(method: string, ...args: unknown[]): void {
    this.calls.push({ method, args });
  }
  argsOf(method: string): unknown[] | undefined {
    return this.calls.find((call) => call.method === method)?.args;
  }

  getDistrict(districtId: string): DistrictOverviewRef | null {
    this.#record('getDistrict', districtId);
    return this.district;
  }
  getCounty(countyId: string): { id: string; name: string } | null {
    this.#record('getCounty', countyId);
    return this.county;
  }
  listActiveSchools(districtId: string): DistrictSchoolRef[] {
    this.#record('listActiveSchools', districtId);
    return this.schools;
  }
  countActiveStudentsBySchool(districtId: string) {
    this.#record('countActiveStudentsBySchool', districtId);
    return this.studentsBySchool;
  }
  countTeachingStaffBySchool(districtId: string) {
    this.#record('countTeachingStaffBySchool', districtId);
    return this.teachersBySchool;
  }
  countActiveStudentsByGender(districtId: string) {
    this.#record('countActiveStudentsByGender', districtId);
    return this.studentsByGender;
  }
  listActiveStudentCreations(districtId: string, sinceIso: string) {
    this.#record('listActiveStudentCreations', districtId, sinceIso);
    return this.studentCreations.filter((row) => row.createdAt >= sinceIso);
  }
  attendanceBySchool(districtId: string, sinceDate: string) {
    this.#record('attendanceBySchool', districtId, sinceDate);
    return this.attendance;
  }
  lastAttendanceDateBySchool(districtId: string) {
    this.#record('lastAttendanceDateBySchool', districtId);
    return this.lastAttendance;
  }
  attendanceByMonth(districtId: string, sinceDate: string) {
    this.#record('attendanceByMonth', districtId, sinceDate);
    return this.attendanceMonths;
  }
  schoolsWithRunningTerm(districtId: string, today: string): string[] {
    this.#record('schoolsWithRunningTerm', districtId, today);
    return this.termSchools;
  }
  listOpenAlerts(districtId: string): DistrictAlertRow[] {
    this.#record('listOpenAlerts', districtId);
    return this.alerts;
  }
  listSubmittedReports(districtId: string, limit: number): DistrictReportRow[] {
    this.#record('listSubmittedReports', districtId, limit);
    return this.reports.slice(0, limit);
  }
  lastSubmissionBySchool(districtId: string) {
    this.#record('lastSubmissionBySchool', districtId);
    return this.lastSubmissions;
  }
  schoolAdminNameBySchool(districtId: string) {
    this.#record('schoolAdminNameBySchool', districtId);
    return this.schoolAdmins;
  }
  listSchoolAdmins(districtId: string, monthStartIso: string, nextMonthIso: string): DistrictSchoolAdminRow[] {
    this.#record('listSchoolAdmins', districtId, monthStartIso, nextMonthIso);
    return this.schoolAdminRows;
  }
  listTeachers(districtId: string): DistrictTeacherRow[] {
    this.#record('listTeachers', districtId);
    return this.teacherRows;
  }
  countAtRiskStudentsBySchool(districtId: string, sinceDate: string) {
    this.#record('countAtRiskStudentsBySchool', districtId, sinceDate);
    return this.atRiskStudents;
  }
  countOpenInfrastructureIssuesBySchool(districtId: string) {
    this.#record('countOpenInfrastructureIssuesBySchool', districtId);
    return this.infrastructureIssues;
  }
  reportMonthsBySchool(districtId: string, sinceDate: string) {
    this.#record('reportMonthsBySchool', districtId, sinceDate);
    return this.reportMonths;
  }
}

/** Records each resolve call and returns `result`. */
export class InMemoryDistrictAlertStore implements IDistrictAlertStore {
  result = true;
  readonly calls: { districtId: string; alertId: string; resolvedBy: string; at: string }[] = [];

  resolve(districtId: string, alertId: string, resolvedBy: string, at: string): boolean {
    this.calls.push({ districtId, alertId, resolvedBy, at });
    return this.result;
  }
}
