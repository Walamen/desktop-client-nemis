import type { CountyDashboardResult } from '@nemis-desktop/types';
import { api } from '../api';

export const dashboardBridge = {
  getDashboard: (): Promise<CountyDashboardResult> => api().county.getDashboard(),
};
