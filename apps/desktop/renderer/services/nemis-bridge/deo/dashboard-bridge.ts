import type {
  DeoDashboardResult,
  DeoSchoolAdminsResult,
  DeoSchoolsResult,
  DeoStudentsResult,
  DeoTeachersResult,
  DeoTransfersResult,
  DeoFinanceResult,
  DeoFinanceAuditEntry,
  CountyAcademicReport,
  CountyAttendanceReport,
  CountyEnrollmentReport,
  CountyStaffComplianceReport,
  DeoAttendanceReportQuery,
  DeoReportQuery,
  DeoReportScope,
} from '@nemis-desktop/types';
import { api } from '../api';

export const dashboardBridge = {
  getDashboard: (): Promise<DeoDashboardResult> => api().deo.getDashboard(),
  resolveAlert: (alertId: string): Promise<boolean> => api().deo.resolveAlert(alertId),
  listSchools: (): Promise<DeoSchoolsResult> => api().deo.listSchools(),
  listSchoolAdmins: (): Promise<DeoSchoolAdminsResult> => api().deo.listSchoolAdmins(),
  listStudents: (): Promise<DeoStudentsResult> => api().deo.listStudents(),
  listTransfers: (): Promise<DeoTransfersResult> => api().deo.listTransfers(),
  getFinance: (): Promise<DeoFinanceResult> => api().deo.getFinance(),
  listFinanceAudit: (): Promise<DeoFinanceAuditEntry[]> => api().deo.listFinanceAudit(),
  getReportScope: (): Promise<DeoReportScope> => api().deo.getReportScope(),
  getEnrollmentReport: (query: DeoReportQuery): Promise<CountyEnrollmentReport> => api().deo.getEnrollmentReport(query),
  getAttendanceReport: (query: DeoAttendanceReportQuery): Promise<CountyAttendanceReport> =>
    api().deo.getAttendanceReport(query),
  getAcademicReport: (query: DeoReportQuery): Promise<CountyAcademicReport> => api().deo.getAcademicReport(query),
  getStaffComplianceReport: (query: DeoReportQuery): Promise<CountyStaffComplianceReport> =>
    api().deo.getStaffComplianceReport(query),
  listTeachers: (): Promise<DeoTeachersResult> => api().deo.listTeachers(),
};
