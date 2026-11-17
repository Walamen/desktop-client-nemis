import type { DeoApplicationService } from '@nemis-desktop/application';
import { deoBridge } from '@/services/nemis-bridge/deo';
import { group, query } from './core';

/** ApplicationLayer groups the DEO (district) portal owns. */
export const deoIpc = {
  deo: group<DeoApplicationService>('deo', {
    getDashboard: () => query(() => deoBridge.getDashboard()),
    resolveAlert: (alertId) => query(() => deoBridge.resolveAlert(alertId)),
    listSchools: () => query(() => deoBridge.listSchools()),
    listSchoolAdmins: () => query(() => deoBridge.listSchoolAdmins()),
    listStudents: () => query(() => deoBridge.listStudents()),
    listTransfers: () => query(() => deoBridge.listTransfers()),
    getFinance: () => query(() => deoBridge.getFinance()),
    listFinanceAudit: () => query(() => deoBridge.listFinanceAudit()),
    getReportScope: () => query(() => deoBridge.getReportScope()),
    getEnrollmentReport: (q) => query(() => deoBridge.getEnrollmentReport(q)),
    getAttendanceReport: (q) => query(() => deoBridge.getAttendanceReport(q)),
    getAcademicReport: (q) => query(() => deoBridge.getAcademicReport(q)),
    getStaffComplianceReport: (q) => query(() => deoBridge.getStaffComplianceReport(q)),
    listTeachers: () => query(() => deoBridge.listTeachers()),
  }),
};
