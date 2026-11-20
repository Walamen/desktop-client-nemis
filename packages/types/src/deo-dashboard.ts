import type {
  CountyAcademicReport,
  CountyAttendancePeriod,
  CountyAttendanceReport,
  CountyEnrollmentReport,
  CountyReportSchool,
  CountyStaffComplianceReport,
} from './county-reports';
import type {
  CountyDirectMessage,
  CountyMessagingOverview,
  CountySendMessageRequest,
  CountyStartConversationRequest,
} from './county-messaging';
import type { CountyNotification } from './county-notifications';
import type { OnlineCommandResult } from './registry';

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
  performanceStatus: SchoolPerformanceStatus;
  complianceStatus: SchoolComplianceStatus;
  /** Current-year collection rate; null when the school bills nothing. */
  feeCollectionRate: number | null;
  /** The active School Admin, else the profile's principal; null if neither. */
  principalName: string | null;
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

/** One school on the DEO School detail page (Nemis DistrictSchoolDetail). */
export interface DeoSchoolDetail extends DeoSchoolRow {
  address: string | null;
  establishedYear: number | null;
  gender: { male: number; female: number };
  enrollmentByGrade: { gradeLevel: string | null; students: number }[];
  academic: { totalGrades: number; averageScore: number | null };
}

export interface DeoSchoolDetailResult {
  /** Null when the signed-in DEO has no district assigned. */
  districtId: string | null;
  /** Null when the school is not an active school of the district. */
  school: DeoSchoolDetail | null;
}

export type DeoComplianceStatus = 'APPROVED' | 'PENDING' | 'REJECTED' | 'MISSING';
/** One row of the Reports & Compliance page (Nemis DistrictComplianceItem). */
export interface DeoComplianceItem {
  id: string;
  schoolId: string;
  schoolName: string;
  schoolCode: string;
  /** Registration | Teacher Roster */
  reportType: string;
  period: string;
  submittedBy: string;
  note: string;
  date: string | null;
  status: DeoComplianceStatus;
}
export interface DeoComplianceSummary {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  missing: number;
}
export interface DeoReportsComplianceResult {
  districtId: string | null;
  district: { id: string; name: string } | null;
  county: { id: string; name: string } | null;
  summary: DeoComplianceSummary;
  items: DeoComplianceItem[];
}

export type DeoAlertFilter = 'open' | 'resolved' | 'all';

export interface DeoAlertsQuery {
  filter: DeoAlertFilter;
  page: number;
}

export interface DeoAlertListItem {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  institutionId: string | null;
  schoolName: string | null;
  isResolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
}

export interface DeoAlertsResult {
  districtId: string | null;
  district: { id: string; name: string } | null;
  county: { id: string; name: string } | null;
  alerts: DeoAlertListItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export type DeoInfrastructureStatus = 'OPEN' | 'UNDER_REVIEW' | 'ESCALATED';

/** One open infrastructure issue of the district, as the Infrastructure page lists it. */
export interface DeoInfrastructureIssue {
  id: string;
  schoolId: string | null;
  schoolName: string;
  category: string;
  title: string;
  note: string;
  severity: string;
  status: DeoInfrastructureStatus;
  reportedAt: string;
}

export interface DeoInfrastructureSummary {
  totalIssues: number;
  critical: number;
  open: number;
  escalated: number;
}

export interface DeoInfrastructureResult {
  districtId: string | null;
  district: { id: string; name: string } | null;
  county: { id: string; name: string } | null;
  summary: DeoInfrastructureSummary;
  issues: DeoInfrastructureIssue[];
}

export interface DeoInfrastructureActionRequest {
  issueId: string;
  comments?: string;
}

export interface DeoInfrastructureEscalateRequest {
  issueId: string;
  reason: string;
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

/** One school on DEO Students & Enrollment. */
export interface DeoEnrollmentSchool {
  id: string;
  name: string;
  code: string;
  levels: string[];
  students: number;
  teachers: number;
  /** Last 30 days; null when the school recorded none. */
  attendanceRate: number | null;
  performanceStatus: SchoolPerformanceStatus;
}

/** A school with pupils that needs a look: low attendance or flagged. */
export interface DeoDropoutAlert {
  schoolId: string;
  schoolName: string;
  attendanceRate: number | null;
  reason: string;
  /** Active pupils with at least 5 records in 30 days and under 80% attended. */
  atRiskStudents: number;
}

/** DEO Students & Enrollment, from this device. The server builds the same
 * for the web (Nemis districts.service.ts getDistrictStudentEnrollment). */
export interface DeoStudentsResult {
  districtId: string | null;
  district: { id: string; name: string } | null;
  county: { id: string; name: string } | null;
  summary: {
    totalEnrollment: number;
    male: number;
    female: number;
    /** All attended over all records, last 30 days; null with no records. */
    avgAttendance: number | null;
  };
  enrollmentTrend: { period: string; enrollment: number }[];
  genderDistribution: { male: number; female: number };
  /** By name. */
  schools: DeoEnrollmentSchool[];
  /** Worst attendance first, no-data last, then by name. */
  dropoutAlerts: DeoDropoutAlert[];
}

/** Which way a transfer crosses the district boundary. */
export type TransferDirection = 'INTO' | 'OUT_OF' | 'WITHIN';

/** One transfer on DEO Transfers (oversight only: schools decide). */
export interface DeoTransfer {
  id: string;
  studentName: string;
  studentNemisId: string | null;
  fromSchool: { id: string; name: string };
  toSchool: { id: string; name: string };
  direction: TransferDirection;
  /** As stored: a lapsed request stays PENDING. */
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  /** A RECEIVING_SCHOOL request past lapsesAt: the asking school may complete it. */
  lapsed: boolean;
  initiatedBy: 'ORIGIN_SCHOOL' | 'RECEIVING_SCHOOL';
  /** The school expected to act next; null once decided or cancelled. */
  awaitingSchool: { id: string; name: string } | null;
  requestedGrade: string | null;
  reason: string;
  reviewNotes: string | null;
  createdAt: string;
  requestedDate: string | null;
  reviewedAt: string | null;
}

/** DEO Transfers, from this device. The server builds the same for the web
 * (Nemis districts.service.ts getDistrictTransferOverview). */
export interface DeoTransfersResult {
  districtId: string | null;
  district: { id: string; name: string } | null;
  county: { id: string; name: string } | null;
  /** Newest first, then by id. */
  transfers: DeoTransfer[];
  summary: { pending: number; lapsed: number };
}

export type DeoFinanceStatus = 'On Track' | 'At Risk' | 'Behind' | 'No Data';

/** One school on the DEO Finance page, its current academic year. */
export interface DeoFinanceSchool {
  schoolId: string;
  schoolName: string;
  schoolCode: string;
  /** The active School Admin, else the metadata principal, else "Not recorded". */
  principalName: string;
  allocation: number;
  collected: number;
  /** Never negative. */
  outstanding: number;
  complianceRate: number;
  studentCount: number;
  lastPaymentAt: string | null;
  status: DeoFinanceStatus;
}

/** A Flagged Activity row: a school that billed or collected anything. */
export interface DeoFinanceFlaggedRow {
  schoolId: string;
  schoolName: string;
  schoolCode: string;
  expected: number;
  collected: number;
  outstanding: number;
  collectionRate: number;
  isFlagged: boolean;
}

/** DEO Finance, from this device. Rules: docs/superpowers/specs/2026-11-17-deo-finance-design.md;
 * the server builds the same for the web (Nemis districts.service.ts getDistrictFinance). */
export interface DeoFinanceResult {
  districtId: string | null;
  district: { id: string; name: string } | null;
  county: { id: string; name: string } | null;
  summary: {
    totalAllocation: number;
    totalCollected: number;
    totalOutstanding: number;
    complianceRate: number;
    schoolsBilling: number;
    schoolsBehind: number;
  };
  /** Six months, oldest first, label "Nov". */
  trend: { period: string; amount: number }[];
  /** Best rate first, then name, then id. */
  schools: DeoFinanceSchool[];
  /** Lowest rate first, then name. */
  flagged: DeoFinanceFlaggedRow[];
}

/** A fee rule, obligation or payment audit entry of the district, synced from the server. */
export interface DeoFinanceAuditEntry {
  id: string;
  timestamp: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string | null;
}

/** DEO Notifications: every notification of the signed-in user on this
 * device, newest first (docs/superpowers/specs/2026-11-17-deo-messages-notifications-design.md). */
export interface DeoNotificationsResult {
  districtId: string | null;
  district: { id: string; name: string } | null;
  county: { id: string; name: string } | null;
  items: CountyNotification[];
  unread: number;
}

/** DEO Settings, read from this device (docs/superpowers/specs/2026-11-17-deo-settings-design.md).
 * `profile` is null when the signed-in user's row was never synced. */
export interface DeoSettingsResult {
  districtId: string | null;
  district: { id: string; name: string } | null;
  county: { id: string; name: string } | null;
  profile: { firstName: string; lastName: string; email: string | null; phoneNumber: string | null } | null;
}

/** What only the server holds (not synced): fetched when connected. */
export interface DeoSettingsRemote {
  officeAddress: string | null;
}

/** Save Changes (online). Passwords come as a pair or not at all. */
export interface DeoSettingsSaveRequest {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  officeAddress?: string;
  currentPassword?: string;
  newPassword?: string;
}

/** DEO Generate Reports: the district comes from the session; only a school may be chosen. */
export interface DeoReportQuery {
  schoolId?: string;
}

export interface DeoAttendanceReportQuery extends DeoReportQuery {
  /** Defaults to WEEKLY (last 28 days). */
  period?: CountyAttendancePeriod;
}

/** DEO Generate Reports header, export letterhead and School filter. */
export interface DeoReportScope {
  districtId: string | null;
  district: { id: string; name: string } | null;
  county: { id: string; name: string; code: string | null } | null;
  /** The district's active schools, by name. */
  schools: CountyReportSchool[];
}

/** DEO portal calls on `window.nemis.deo`. */
export interface DeoApi {
  getDashboard(): Promise<DeoDashboardResult>;
  listSchools(): Promise<DeoSchoolsResult>;
  getSchool(schoolId: string): Promise<DeoSchoolDetailResult>;
  listSchoolAdmins(): Promise<DeoSchoolAdminsResult>;
  listTeachers(): Promise<DeoTeachersResult>;
  listStudents(): Promise<DeoStudentsResult>;
  listTransfers(): Promise<DeoTransfersResult>;
  getFinance(): Promise<DeoFinanceResult>;
  /** The newest 50 finance audit entries of the district. */
  listFinanceAudit(): Promise<DeoFinanceAuditEntry[]>;
  /** Messages: read from this device; start/send/mark-read are online-only. */
  getMessagingOverview(): Promise<CountyMessagingOverview>;
  listDirectMessages(conversationId: string): Promise<CountyDirectMessage[] | null>;
  startConversation(request: CountyStartConversationRequest): Promise<OnlineCommandResult<null>>;
  sendDirectMessage(request: CountySendMessageRequest): Promise<OnlineCommandResult<null>>;
  markConversationRead(conversationId: string): Promise<OnlineCommandResult<null>>;
  /** Of these users, the ones the live socket says are online now. */
  getOnlineUsers(userIds: string[]): Promise<string[]>;
  /** Settings: the profile offline; office address and saving need a connection. */
  getSettings(): Promise<DeoSettingsResult>;
  getRemoteSettings(): Promise<OnlineCommandResult<DeoSettingsRemote>>;
  saveSettings(request: DeoSettingsSaveRequest): Promise<OnlineCommandResult<null>>;
  /** Notifications: the user's own, offline; marking read syncs through the outbox. */
  listNotifications(): Promise<DeoNotificationsResult>;
  markNotificationRead(notificationId: string): Promise<boolean>;
  markAllNotificationsRead(): Promise<number>;
  getReportScope(): Promise<DeoReportScope>;
  getEnrollmentReport(query: DeoReportQuery): Promise<CountyEnrollmentReport>;
  getAttendanceReport(query: DeoAttendanceReportQuery): Promise<CountyAttendanceReport>;
  getAcademicReport(query: DeoReportQuery): Promise<CountyAcademicReport>;
  getStaffComplianceReport(query: DeoReportQuery): Promise<CountyStaffComplianceReport>;
  getReportsCompliance(): Promise<DeoReportsComplianceResult>;
  /** Marks an alert reviewed on this device; the outbox syncs it later. */
  resolveAlert(alertId: string): Promise<boolean>;
  /** One page of the district's alerts, open / resolved / all. */
  listAlerts(query: DeoAlertsQuery): Promise<DeoAlertsResult>;
}
