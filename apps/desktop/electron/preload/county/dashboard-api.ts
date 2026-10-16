import { IpcChannels } from '@nemis-desktop/types';
import type { CountyApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const countyDashboardApi: CountyApi = {
  getDashboard: () => invoke(IpcChannels.COUNTY_GET_DASHBOARD),
};
