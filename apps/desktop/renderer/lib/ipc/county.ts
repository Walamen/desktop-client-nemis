import type { CountyApplicationService } from '@nemis-desktop/application';
import { countyBridge } from '@/services/nemis-bridge/county';
import { group, query } from './core';

/** ApplicationLayer groups the County (CEO) portal owns. */
export const countyIpc = {
  county: group<CountyApplicationService>('county', {
    getDashboard: () => query(() => countyBridge.getDashboard()),
    listDistricts: () => query(() => countyBridge.listDistricts()),
    getDistrict: (districtId) => query(() => countyBridge.getDistrict(districtId)),
    listSchools: () => query(() => countyBridge.listSchools()),
    getSchool: (schoolId) => query(() => countyBridge.getSchool(schoolId)),
    getRegistrationContext: () => query(() => countyBridge.getRegistrationContext()),
    registerSchools: (request) => query(() => countyBridge.registerSchools(request)),
    resubmitSchoolRegistration: (request) => query(() => countyBridge.resubmitSchoolRegistration(request)),
    discardSchoolRegistration: (id) => query(() => countyBridge.discardSchoolRegistration(id)),
    getSchoolRegistrations: (ids) => query(() => countyBridge.getSchoolRegistrations(ids)),
    listStudents: (studentsQuery) => query(() => countyBridge.listStudents(studentsQuery)),
    getStudent: (studentId) => query(() => countyBridge.getStudent(studentId)),
    listGuardians: (guardiansQuery) => query(() => countyBridge.listGuardians(guardiansQuery)),
    getGuardian: (guardianId) => query(() => countyBridge.getGuardian(guardianId)),
    listTeachers: (teachersQuery) => query(() => countyBridge.listTeachers(teachersQuery)),
    getTeacher: (teacherId) => query(() => countyBridge.getTeacher(teacherId)),
    getFinanceDashboard: () => query(() => countyBridge.getFinanceDashboard()),
    listFinanceSchools: () => query(() => countyBridge.listFinanceSchools()),
    listFeeCollections: (paymentsQuery) => query(() => countyBridge.listFeeCollections(paymentsQuery)),
    listFeeRules: (rulesQuery) => query(() => countyBridge.listFeeRules(rulesQuery)),
    getReportOptions: () => query(() => countyBridge.getReportOptions()),
    listReportSchools: (districtId) => query(() => countyBridge.listReportSchools(districtId)),
    getEnrollmentReport: (reportQuery) => query(() => countyBridge.getEnrollmentReport(reportQuery)),
    getAttendanceReport: (reportQuery) => query(() => countyBridge.getAttendanceReport(reportQuery)),
    getAcademicReport: (reportQuery) => query(() => countyBridge.getAcademicReport(reportQuery)),
    getStaffComplianceReport: (reportQuery) => query(() => countyBridge.getStaffComplianceReport(reportQuery)),
    getMessagingOverview: () => query(() => countyBridge.getMessagingOverview()),
    listDirectMessages: (conversationId) => query(() => countyBridge.listDirectMessages(conversationId)),
    listNotifications: (notificationsQuery) => query(() => countyBridge.listNotifications(notificationsQuery)),
    markNotificationRead: (notificationId) => query(() => countyBridge.markNotificationRead(notificationId)),
    markAllNotificationsRead: () => query(() => countyBridge.markAllNotificationsRead()),
    listUsers: (usersQuery) => query(() => countyBridge.listUsers(usersQuery)),
    getUserOptions: () => query(() => countyBridge.getUserOptions()),
  }),
};
