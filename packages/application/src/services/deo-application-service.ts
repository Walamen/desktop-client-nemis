import type {
  DeoDashboardResult,
  DeoSchoolAdminsResult,
  DeoSchoolDetailResult,
  DeoSchoolsResult,
  DeoReportsComplianceResult,
  DeoStudentsResult,
  DeoTeachersResult,
  DeoTransfersResult,
  DeoFinanceAuditEntry,
  DeoFinanceResult,
  DeoNotificationsResult,
  DeoSettingsResult,
  CountyDirectMessage,
  CountyMessagingOverview,
  CountyAcademicReport,
  CountyAttendanceReport,
  CountyEnrollmentReport,
  CountyStaffComplianceReport,
  DeoAttendanceReportQuery,
  DeoReportQuery,
  DeoReportScope,
} from '@nemis-desktop/types';
import type { ApplicationResponse } from '../core/response';
import type { GetDeoDashboardUseCase } from '../use-cases/deo/get-deo-dashboard';
import type { ResolveDistrictAlertUseCase } from '../use-cases/deo/resolve-district-alert';
import type { GetDeoSchoolsUseCase } from '../use-cases/deo/get-deo-schools';
import type { GetDeoReportsComplianceUseCase } from '../use-cases/deo/get-deo-reports-compliance';
import type { GetDeoSchoolDetailUseCase } from '../use-cases/deo/get-deo-school-detail';
import type { GetDeoSchoolAdminsUseCase } from '../use-cases/deo/get-deo-school-admins';
import type { GetDeoTeachersUseCase } from '../use-cases/deo/get-deo-teachers';
import type { GetDeoStudentsUseCase } from '../use-cases/deo/get-deo-students';
import type { GetDeoTransfersUseCase } from '../use-cases/deo/get-deo-transfers';
import type { GetDeoFinanceAuditUseCase, GetDeoFinanceUseCase } from '../use-cases/deo/get-deo-finance';
import type {
  GetDeoMessagesUseCase,
  GetDeoMessagingOverviewUseCase,
  GetDeoNotificationsUseCase,
  MarkAllDeoNotificationsReadUseCase,
  MarkDeoNotificationReadUseCase,
} from '../use-cases/deo/get-deo-messaging';
import type { GetDeoSettingsUseCase } from '../use-cases/deo/get-deo-settings';
import type { DeoReportUseCase, GetDeoReportScopeUseCase } from '../use-cases/deo/deo-reports';

export interface DeoApplicationServiceDeps {
  getDashboard: GetDeoDashboardUseCase;
  resolveAlert: ResolveDistrictAlertUseCase;
  listSchools: GetDeoSchoolsUseCase;
  getSchool: GetDeoSchoolDetailUseCase;
  getReportsCompliance: GetDeoReportsComplianceUseCase;
  listSchoolAdmins: GetDeoSchoolAdminsUseCase;
  listTeachers: GetDeoTeachersUseCase;
  listStudents: GetDeoStudentsUseCase;
  listTransfers: GetDeoTransfersUseCase;
  getFinance: GetDeoFinanceUseCase;
  listFinanceAudit: GetDeoFinanceAuditUseCase;
  getMessagingOverview: GetDeoMessagingOverviewUseCase;
  listDirectMessages: GetDeoMessagesUseCase;
  listNotifications: GetDeoNotificationsUseCase;
  markNotificationRead: MarkDeoNotificationReadUseCase;
  markAllNotificationsRead: MarkAllDeoNotificationsReadUseCase;
  getSettings: GetDeoSettingsUseCase;
  getReportScope: GetDeoReportScopeUseCase;
  getEnrollmentReport: DeoReportUseCase<DeoReportQuery, CountyEnrollmentReport>;
  getAttendanceReport: DeoReportUseCase<DeoAttendanceReportQuery, CountyAttendanceReport>;
  getAcademicReport: DeoReportUseCase<DeoReportQuery, CountyAcademicReport>;
  getStaffComplianceReport: DeoReportUseCase<DeoReportQuery, CountyStaffComplianceReport>;
}

/** Everything the DEO (district) portal asks of the application layer. */
export class DeoApplicationService {
  constructor(private readonly deps: DeoApplicationServiceDeps) {}

  getDashboard(): Promise<ApplicationResponse<DeoDashboardResult>> {
    return this.deps.getDashboard.execute({});
  }

  listSchools(): Promise<ApplicationResponse<DeoSchoolsResult>> {
    return this.deps.listSchools.execute({});
  }

  getSchool(schoolId: string): Promise<ApplicationResponse<DeoSchoolDetailResult>> {
    return this.deps.getSchool.execute({ schoolId });
  }

  getReportsCompliance(): Promise<ApplicationResponse<DeoReportsComplianceResult>> {
    return this.deps.getReportsCompliance.execute({});
  }

  listSchoolAdmins(): Promise<ApplicationResponse<DeoSchoolAdminsResult>> {
    return this.deps.listSchoolAdmins.execute({});
  }

  listTeachers(): Promise<ApplicationResponse<DeoTeachersResult>> {
    return this.deps.listTeachers.execute({});
  }

  listStudents(): Promise<ApplicationResponse<DeoStudentsResult>> {
    return this.deps.listStudents.execute({});
  }

  listTransfers(): Promise<ApplicationResponse<DeoTransfersResult>> {
    return this.deps.listTransfers.execute({});
  }

  getFinance(): Promise<ApplicationResponse<DeoFinanceResult>> {
    return this.deps.getFinance.execute({});
  }

  listFinanceAudit(): Promise<ApplicationResponse<DeoFinanceAuditEntry[]>> {
    return this.deps.listFinanceAudit.execute({});
  }

  getMessagingOverview(): Promise<ApplicationResponse<CountyMessagingOverview>> {
    return this.deps.getMessagingOverview.execute({});
  }

  listDirectMessages(conversationId: string): Promise<ApplicationResponse<CountyDirectMessage[] | null>> {
    return this.deps.listDirectMessages.execute({ conversationId });
  }

  listNotifications(): Promise<ApplicationResponse<DeoNotificationsResult>> {
    return this.deps.listNotifications.execute({});
  }

  markNotificationRead(notificationId: string): Promise<ApplicationResponse<boolean>> {
    return this.deps.markNotificationRead.execute({ notificationId });
  }

  markAllNotificationsRead(): Promise<ApplicationResponse<number>> {
    return this.deps.markAllNotificationsRead.execute({});
  }

  getSettings(): Promise<ApplicationResponse<DeoSettingsResult>> {
    return this.deps.getSettings.execute({});
  }

  getReportScope(): Promise<ApplicationResponse<DeoReportScope>> {
    return this.deps.getReportScope.execute({});
  }

  getEnrollmentReport(query: DeoReportQuery): Promise<ApplicationResponse<CountyEnrollmentReport>> {
    return this.deps.getEnrollmentReport.execute(query);
  }

  getAttendanceReport(query: DeoAttendanceReportQuery): Promise<ApplicationResponse<CountyAttendanceReport>> {
    return this.deps.getAttendanceReport.execute(query);
  }

  getAcademicReport(query: DeoReportQuery): Promise<ApplicationResponse<CountyAcademicReport>> {
    return this.deps.getAcademicReport.execute(query);
  }

  getStaffComplianceReport(query: DeoReportQuery): Promise<ApplicationResponse<CountyStaffComplianceReport>> {
    return this.deps.getStaffComplianceReport.execute(query);
  }

  resolveAlert(alertId: string): Promise<ApplicationResponse<boolean>> {
    return this.deps.resolveAlert.execute({ alertId });
  }
}
