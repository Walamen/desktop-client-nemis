import type {
  CountyAcademicReport,
  CountyAttendanceReport,
  CountyAttendanceReportQuery,
  CountyStaffComplianceReport,
  CountyEnrollmentReport,
  CountyEnrollmentReportQuery,
  CountyReportOptions,
  CountyReportSchool,
} from '@nemis-desktop/types';
import { api } from '../api';

export const reportsBridge = {
  getReportOptions: (): Promise<CountyReportOptions> => api().county.getReportOptions(),
  listReportSchools: (districtId: string): Promise<CountyReportSchool[]> => api().county.listReportSchools(districtId),
  getEnrollmentReport: (query: CountyEnrollmentReportQuery): Promise<CountyEnrollmentReport> =>
    api().county.getEnrollmentReport(query),
  getAttendanceReport: (query: CountyAttendanceReportQuery): Promise<CountyAttendanceReport> =>
    api().county.getAttendanceReport(query),
  getAcademicReport: (query: CountyEnrollmentReportQuery): Promise<CountyAcademicReport> =>
    api().county.getAcademicReport(query),
  getStaffComplianceReport: (query: CountyEnrollmentReportQuery): Promise<CountyStaffComplianceReport> =>
    api().county.getStaffComplianceReport(query),
};
