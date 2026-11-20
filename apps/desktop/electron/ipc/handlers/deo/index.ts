/** DEO (district) portal IPC handlers, one file per area, organized the same
 * way as county/, school-admin/ and teacher/. */
export { registerDeoDashboardHandlers } from './dashboard';
export { registerDeoSchoolHandlers } from './schools';
export { registerDeoSchoolAdminHandlers } from './school-admins';
export { registerDeoStudentHandlers } from './students';
export { registerDeoTransferHandlers } from './transfers';
export { registerDeoFinanceHandlers } from './finance';
export { registerDeoMessagingHandlers } from './messaging';
export { registerDeoSettingsHandlers } from './settings';
export { registerDeoReportHandlers } from './reports';
export { registerDeoTeacherHandlers } from './teachers';
export { registerDeoInfrastructureHandlers } from './infrastructure';
