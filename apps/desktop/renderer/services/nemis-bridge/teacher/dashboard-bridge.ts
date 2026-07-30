import type { TeacherDashboardResult } from '@nemis-desktop/types';
import { api } from '../api';

export const teacherDashboardBridge = {
  getTeacherDashboard: (): Promise<TeacherDashboardResult> => api().teacher.getDashboard(),
};
