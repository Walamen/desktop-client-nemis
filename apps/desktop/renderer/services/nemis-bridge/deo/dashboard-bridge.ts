import type { DeoDashboardResult, DeoSchoolAdminsResult, DeoSchoolsResult } from '@nemis-desktop/types';
import { api } from '../api';

export const dashboardBridge = {
  getDashboard: (): Promise<DeoDashboardResult> => api().deo.getDashboard(),
  resolveAlert: (alertId: string): Promise<boolean> => api().deo.resolveAlert(alertId),
  listSchools: (): Promise<DeoSchoolsResult> => api().deo.listSchools(),
  listSchoolAdmins: (): Promise<DeoSchoolAdminsResult> => api().deo.listSchoolAdmins(),
};
