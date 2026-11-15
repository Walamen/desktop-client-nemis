import type { DeoDashboardResult } from '@nemis-desktop/types';
import { api } from '../api';

export const dashboardBridge = {
  getDashboard: (): Promise<DeoDashboardResult> => api().deo.getDashboard(),
  resolveAlert: (alertId: string): Promise<boolean> => api().deo.resolveAlert(alertId),
};
