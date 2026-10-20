import { IpcChannels } from '@nemis-desktop/types';
import type { CountyApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const countyReportsApi: Pick<CountyApi, 'getReportOptions' | 'listReportSchools' | 'getEnrollmentReport'> = {
  getReportOptions: () => invoke(IpcChannels.COUNTY_REPORT_OPTIONS),
  listReportSchools: (districtId) => invoke(IpcChannels.COUNTY_REPORT_SCHOOLS, districtId),
  getEnrollmentReport: (query) => invoke(IpcChannels.COUNTY_ENROLLMENT_REPORT, query),
};
