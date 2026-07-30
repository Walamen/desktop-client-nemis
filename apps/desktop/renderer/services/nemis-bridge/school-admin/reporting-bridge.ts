import type { DashboardOverviewResult } from '@nemis-desktop/types';
import { api } from '../api';

export const reportingBridge = {
  getDashboardOverview: (): Promise<DashboardOverviewResult> => api().dashboard.getOverview(),
};
