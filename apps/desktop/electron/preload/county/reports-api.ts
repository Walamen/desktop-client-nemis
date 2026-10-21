import { IpcChannels } from '@nemis-desktop/types';
import type { CountyApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const countyReportsApi: Pick<
  CountyApi,
  | 'getReportOptions'
  | 'listReportSchools'
  | 'getEnrollmentReport'
  | 'getAttendanceReport'
  | 'getAcademicReport'
  | 'getStaffComplianceReport'
> = {
  getReportOptions: () => invoke(IpcChannels.COUNTY_REPORT_OPTIONS),
  listReportSchools: (districtId) => invoke(IpcChannels.COUNTY_REPORT_SCHOOLS, districtId),
  getEnrollmentReport: (query) => invoke(IpcChannels.COUNTY_ENROLLMENT_REPORT, query),
  getAttendanceReport: (query) => invoke(IpcChannels.COUNTY_ATTENDANCE_REPORT, query),
  getAcademicReport: (query) => invoke(IpcChannels.COUNTY_ACADEMIC_REPORT, query),
  getStaffComplianceReport: (query) => invoke(IpcChannels.COUNTY_STAFF_REPORT, query),
};
