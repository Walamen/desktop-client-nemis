import { IpcChannels } from '@nemis-desktop/types';
import type { TeacherApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const teacherDashboardApi: Pick<TeacherApi, 'getDashboard'> = {
  getDashboard: () => invoke(IpcChannels.TEACHER_GET_DASHBOARD),
};
