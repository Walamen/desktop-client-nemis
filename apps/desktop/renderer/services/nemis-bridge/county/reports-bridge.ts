import type {
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
};
