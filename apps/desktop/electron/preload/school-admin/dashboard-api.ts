import { IpcChannels } from '@nemis-desktop/types';
import type { DashboardApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const dashboardApi: DashboardApi = {
  getOverview: () => invoke(IpcChannels.DASHBOARD_GET_OVERVIEW),
};
