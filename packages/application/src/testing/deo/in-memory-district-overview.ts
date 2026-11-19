import type {
  DistrictAlertListRow,
  DistrictAlertRow,
  DistrictSchoolAdminRow,
  DistrictTeacherRow,
  DistrictTransferRow,
  DeoUserProfile,
  DistrictOverviewRef,
  DistrictSchoolRef,
  IDistrictOverviewReadModel,
} from '../../interfaces/deo/district-overview-read-model';
import type { IDistrictAlertStore } from '../../interfaces/deo/district-alert-store';
import type { CountyMessageRecipient, DeoFinanceAuditEntry } from '@nemis-desktop/types';

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
  districtAlerts: DistrictAlertListRow[] = [];
  schoolAdmins: { institutionId: string; name: string }[] = [];
  schoolAdminRows: DistrictSchoolAdminRow[] = [];
  infrastructureIssues: { institutionId: string; count: number }[] = [];
  teacherRows: DistrictTeacherRow[] = [];
  atRiskStudents: { institutionId: string; count: number }[] = [];
  transferRows: DistrictTransferRow[] = [];
  financeRows: { institutionId: string; allocation: number; collected: number }[] = [];
  lastPayments: { institutionId: string; paidAt: string }[] = [];
  paymentMonths: { month: string; amount: number }[] = [];
  auditEntries: DeoFinanceAuditEntry[] = [];
  messageContacts: CountyMessageRecipient[] = [];
  userProfile: DeoUserProfile | null = null;
  registrations: { institutionId: string; approvalStatus: string; approvedAt: string | null; createdAt: string | null }[] = [];
  teacherRoster: { institutionId: string; total: number; awaitingApproval: number; newestCreatedAt: string | null }[] = [];
  schoolProfile: { address: string | null; establishedYear: number | null } | null = null;
  schoolGender: { gender: string; count: number }[] = [];
  schoolGrades: { gradeLevel: string | null; students: number }[] = [];
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
  listDistrictAlerts(districtId: string, filter: 'open' | 'resolved' | 'all'): DistrictAlertListRow[] {
    this.#record('listDistrictAlerts', districtId, filter);
    return this.districtAlerts;
  }
  schoolAdminNameBySchool(districtId: string) {
    this.#record('schoolAdminNameBySchool', districtId);
    return this.schoolAdmins;
  }
  listSchoolAdmins(districtId: string): DistrictSchoolAdminRow[] {
    this.#record('listSchoolAdmins', districtId);
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
  listTransfers(districtId: string): DistrictTransferRow[] {
    this.#record('listTransfers', districtId);
    return this.transferRows;
  }
  countOpenInfrastructureIssuesBySchool(districtId: string) {
    this.#record('countOpenInfrastructureIssuesBySchool', districtId);
    return this.infrastructureIssues;
  }
  financeBySchool(districtId: string) {
    this.#record('financeBySchool', districtId);
    return this.financeRows;
  }
  lastPaymentBySchool(districtId: string) {
    this.#record('lastPaymentBySchool', districtId);
    return this.lastPayments;
  }
  paymentsByMonth(districtId: string, sinceIso: string) {
    this.#record('paymentsByMonth', districtId, sinceIso);
    return this.paymentMonths;
  }
  listSchoolRegistrations(districtId: string) {
    this.#record('listSchoolRegistrations', districtId);
    return this.registrations;
  }
  teacherRosterBySchool(districtId: string) {
    this.#record('teacherRosterBySchool', districtId);
    return this.teacherRoster;
  }
  getSchoolProfile(schoolId: string): { address: string | null; establishedYear: number | null } | null {
    this.#record('getSchoolProfile', schoolId);
    return this.schoolProfile;
  }
  countSchoolStudentsByGender(schoolId: string) {
    this.#record('countSchoolStudentsByGender', schoolId);
    return this.schoolGender;
  }
  countSchoolStudentsByGrade(schoolId: string) {
    this.#record('countSchoolStudentsByGrade', schoolId);
    return this.schoolGrades;
  }
  getUserProfile(userId: string): DeoUserProfile | null {
    this.#record('getUserProfile', userId);
    return this.userProfile;
  }
  listMessageContacts(districtId: string, currentUserId: string): CountyMessageRecipient[] {
    this.#record('listMessageContacts', districtId, currentUserId);
    return this.messageContacts;
  }
  listFinanceAudit(limit: number): DeoFinanceAuditEntry[] {
    this.#record('listFinanceAudit', limit);
    return this.auditEntries.slice(0, limit);
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
