import { IpcChannels } from '@nemis-desktop/types';
import type { DeoApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const deoDashboardApi: DeoApi = {
  getDashboard: () => invoke(IpcChannels.DEO_GET_DASHBOARD),
  resolveAlert: (alertId) => invoke(IpcChannels.DEO_RESOLVE_ALERT, alertId),
  listSchools: () => invoke(IpcChannels.DEO_LIST_SCHOOLS),
  listSchoolAdmins: () => invoke(IpcChannels.DEO_LIST_SCHOOL_ADMINS),
  listStudents: () => invoke(IpcChannels.DEO_LIST_STUDENTS),
  listTransfers: () => invoke(IpcChannels.DEO_LIST_TRANSFERS),
  getFinance: () => invoke(IpcChannels.DEO_FINANCE),
  listFinanceAudit: () => invoke(IpcChannels.DEO_FINANCE_AUDIT),
  getMessagingOverview: () => invoke(IpcChannels.DEO_MESSAGING_OVERVIEW),
  listDirectMessages: (conversationId) => invoke(IpcChannels.DEO_MESSAGING_MESSAGES, conversationId),
  startConversation: (request) => invoke(IpcChannels.DEO_MESSAGING_START, request),
  sendDirectMessage: (request) => invoke(IpcChannels.DEO_MESSAGING_SEND, request),
  markConversationRead: (conversationId) => invoke(IpcChannels.DEO_MESSAGING_MARK_READ, conversationId),
  getOnlineUsers: (userIds) => invoke(IpcChannels.MESSAGING_ONLINE_USERS, userIds),
  listNotifications: () => invoke(IpcChannels.DEO_NOTIFICATIONS_LIST),
  markNotificationRead: (notificationId) => invoke(IpcChannels.DEO_NOTIFICATIONS_MARK_READ, notificationId),
  markAllNotificationsRead: () => invoke(IpcChannels.DEO_NOTIFICATIONS_MARK_ALL_READ),
  getReportScope: () => invoke(IpcChannels.DEO_REPORT_SCOPE),
  getEnrollmentReport: (query) => invoke(IpcChannels.DEO_ENROLLMENT_REPORT, query),
  getAttendanceReport: (query) => invoke(IpcChannels.DEO_ATTENDANCE_REPORT, query),
  getAcademicReport: (query) => invoke(IpcChannels.DEO_ACADEMIC_REPORT, query),
  getStaffComplianceReport: (query) => invoke(IpcChannels.DEO_STAFF_REPORT, query),
  listTeachers: () => invoke(IpcChannels.DEO_LIST_TEACHERS),
};

/** The NemisApi slice the DEO (district) portal owns. Add each new area as
 * its own file and spread it in here, the same way county/ is organized. */
export const deoApi = {
  deo: { ...deoDashboardApi },
};
