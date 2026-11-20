import type { DeoApplicationService } from '@nemis-desktop/application';
import { deoBridge } from '@/services/nemis-bridge/deo';
import { group, query } from './core';

/** ApplicationLayer groups the DEO (district) portal owns. */
export const deoIpc = {
  deo: group<DeoApplicationService>('deo', {
    getDashboard: () => query(() => deoBridge.getDashboard()),
    resolveAlert: (alertId) => query(() => deoBridge.resolveAlert(alertId)),
    listAlerts: (alertsQuery) => query(() => deoBridge.listAlerts(alertsQuery)),
    getInfrastructure: () => query(() => deoBridge.getInfrastructure()),
    reviewInfrastructure: (request) => query(() => deoBridge.reviewInfrastructure(request)),
    resolveInfrastructure: (request) => query(() => deoBridge.resolveInfrastructure(request)),
    escalateInfrastructure: (request) => query(() => deoBridge.escalateInfrastructure(request)),
    listSchools: () => query(() => deoBridge.listSchools()),
    getSchool: (schoolId: string) => query(() => deoBridge.getSchool(schoolId)),
    listSchoolAdmins: () => query(() => deoBridge.listSchoolAdmins()),
    listStudents: () => query(() => deoBridge.listStudents()),
    listTransfers: () => query(() => deoBridge.listTransfers()),
    getFinance: () => query(() => deoBridge.getFinance()),
    listFinanceAudit: () => query(() => deoBridge.listFinanceAudit()),
    getMessagingOverview: () => query(() => deoBridge.getMessagingOverview()),
    listDirectMessages: (conversationId) => query(() => deoBridge.listDirectMessages(conversationId)),
    listNotifications: () => query(() => deoBridge.listNotifications()),
    markNotificationRead: (notificationId) => query(() => deoBridge.markNotificationRead(notificationId)),
    markAllNotificationsRead: () => query(() => deoBridge.markAllNotificationsRead()),
    getSettings: () => query(() => deoBridge.getSettings()),
    getReportScope: () => query(() => deoBridge.getReportScope()),
    getEnrollmentReport: (q) => query(() => deoBridge.getEnrollmentReport(q)),
    getAttendanceReport: (q) => query(() => deoBridge.getAttendanceReport(q)),
    getAcademicReport: (q) => query(() => deoBridge.getAcademicReport(q)),
    getStaffComplianceReport: (q) => query(() => deoBridge.getStaffComplianceReport(q)),
    getReportsCompliance: () => query(() => deoBridge.getReportsCompliance()),
    listTeachers: () => query(() => deoBridge.listTeachers()),
  }),
};
