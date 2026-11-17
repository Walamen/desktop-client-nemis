import type {
  DeoDashboardResult,
  DeoSchoolAdminsResult,
  DeoSchoolsResult,
  DeoStudentsResult,
  DeoTeachersResult,
  DeoTransfersResult,
} from '@nemis-desktop/types';
import { api } from '../api';

export const dashboardBridge = {
  getDashboard: (): Promise<DeoDashboardResult> => api().deo.getDashboard(),
  resolveAlert: (alertId: string): Promise<boolean> => api().deo.resolveAlert(alertId),
  listSchools: (): Promise<DeoSchoolsResult> => api().deo.listSchools(),
  listSchoolAdmins: (): Promise<DeoSchoolAdminsResult> => api().deo.listSchoolAdmins(),
  listStudents: (): Promise<DeoStudentsResult> => api().deo.listStudents(),
  listTransfers: (): Promise<DeoTransfersResult> => api().deo.listTransfers(),
  listTeachers: (): Promise<DeoTeachersResult> => api().deo.listTeachers(),
};
