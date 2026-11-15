/** IPC wire shapes for the DEO (district) dashboard. Kept structurally
 * identical to the application-layer output, so the main-process handler
 * returns the DTO directly and the renderer hands it to the presentation
 * layer. See docs/superpowers/specs/2026-11-15-deo-dashboard-design.md. */

export type SchoolComplianceStatus = 'Compliant' | 'Needs Review' | 'Flagged';
export type SchoolPerformanceStatus = 'Good' | 'Warning' | 'Critical' | 'No Data';

/** An unresolved alert of the district or one of its schools. */
export interface DeoAlert {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  institutionId: string | null;
  createdAt: string;
}

/** Counts over every unresolved alert, not only the ones listed. */
export interface DeoAlertSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface DeoSchoolRow {
  id: string;
  name: string;
  code: string;
  levels: string[];
  /** Active students. */
  students: number;
  /** Active teaching staff. */
  teachers: number;
  /** Last 30 days, PRESENT + LATE over all records; null when none recorded. */
  attendanceRate: number | null;
  /** Newest submitted school report. */
  lastSubmissionAt: string | null;
  performanceStatus: SchoolPerformanceStatus;
  complianceStatus: SchoolComplianceStatus;
  /** Current-year collection rate; null when the school bills nothing. */
  feeCollectionRate: number | null;
  /** The active School Admin, else the profile's principal; null if neither. */
  principalName: string | null;
  /** The last three calendar months, oldest first: did the school submit a
   * report dated in that month? */
  reportMonths: boolean[];
}

/** A school report submitted to the district. */
export interface DeoSubmissionRow {
  id: string;
  schoolName: string;
  title: string;
  type: string;
  submittedAt: string;
}

export interface DeoChartData {
  enrollmentTrend: { period: string; enrollment: number }[];
  attendanceTrend: { period: string; rate: number }[];
  genderDistribution: { male: number; female: number };
}

export interface DeoDashboardStats {
  totalSchools: number;
  totalStudents: number;
  totalTeachers: number;
  /** Mean collection rate of the schools that bill; 0 when none do. */
  feeCompliance: number;
}

export interface DeoDashboardResult {
  /** Null when the signed-in DEO has no district assigned. */
  districtId: string | null;
  /** Null when the district row has not been synced (older server). */
  district: { id: string; name: string } | null;
  /** Null when the county row has not been synced (older server). */
  county: { id: string; name: string } | null;
  stats: DeoDashboardStats;
  /** Unresolved, worst severity first then newest; at most 50. */
  alerts: DeoAlert[];
  alertSummary: DeoAlertSummary;
  /** Active schools, by name. */
  schools: DeoSchoolRow[];
  chartData: DeoChartData;
  /** Newest first; at most 50. */
  submissions: DeoSubmissionRow[];
}

/** The Schools Management page. */
export interface DeoSchoolsResult {
  /** Null when the signed-in DEO has no district assigned. */
  districtId: string | null;
  district: { id: string; name: string } | null;
  county: { id: string; name: string } | null;
  /** Active schools, by name. */
  schools: DeoSchoolRow[];
}

/** One School Admin account, as the School Admin Directory shows it. */
export interface DeoSchoolAdmin {
  userId: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  schoolId: string;
  schoolName: string;
  /** The staff record of this user at this school; null when none. */
  employeeNumber: string | null;
  /** False = the account is deactivated ("Suspended"). */
  isActive: boolean;
  /** Account creation. */
  joinedAt: string | null;
  lastLoginAt: string | null;
  /** Reports this admin submitted for this school in the current calendar month. */
  reportsThisMonth: number;
  /** Unresolved INFRASTRUCTURE_ISSUE alerts raised against the school. */
  openInfrastructureIssues: number;
}

export interface DeoSchoolAdminsResult {
  districtId: string | null;
  district: { id: string; name: string } | null;
  county: { id: string; name: string } | null;
  /** By school name, then admin name. */
  admins: DeoSchoolAdmin[];
  /** Active schools with no School Admin, by name. */
  schoolsWithoutAdmin: { id: string; name: string }[];
}

export type TeacherGradesStatus = 'Pending' | 'Submitted' | 'No assessments';

/** One teacher, as DEO Teacher Monitoring shows them. */
export interface DeoTeacher {
  id: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  schoolId: string;
  schoolName: string;
  /** Distinct, sorted: subject_teachers ∪ class_subject_teachers. */
  subjects: string[];
  /** First subject, else first current-year class grade level, else "General". */
  leadSubject: string;
  gradesStatus: TeacherGradesStatus;
  /** approvalStatus is not APPROVED. */
  pendingApproval: boolean;
  /** No class in the school's current academic year. */
  unassigned: boolean;
}

export interface DeoTeachersSummary {
  totalTeachers: number;
  gradesPending: number;
  pendingApproval: number;
  unassigned: number;
}

export interface DeoTeachersResult {
  districtId: string | null;
  district: { id: string; name: string } | null;
  county: { id: string; name: string } | null;
  /** By last name, then first name. */
  teachers: DeoTeacher[];
  summary: DeoTeachersSummary;
}

/** DEO portal calls on `window.nemis.deo`. */
export interface DeoApi {
  getDashboard(): Promise<DeoDashboardResult>;
  listSchools(): Promise<DeoSchoolsResult>;
  listSchoolAdmins(): Promise<DeoSchoolAdminsResult>;
  listTeachers(): Promise<DeoTeachersResult>;
  /** Marks an alert reviewed on this device; the outbox syncs it later. */
  resolveAlert(alertId: string): Promise<boolean>;
}
