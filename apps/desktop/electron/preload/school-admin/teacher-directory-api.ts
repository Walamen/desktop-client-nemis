import { IpcChannels } from '@nemis-desktop/types';
import type { TeacherApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

/** Staff-directory management — school admins creating/editing teacher
 * records and teaching assignments. The teacher's own `getDashboard` method
 * lives in electron/preload/teacher/ instead; preload.ts merges the two
 * into the single `teacher` NemisApi key. */
export const teacherDirectoryApi: Omit<TeacherApi, 'getDashboard'> = {
  list: (request) => invoke(IpcChannels.TEACHER_LIST, request),
  getProfile: (id) => invoke(IpcChannels.TEACHER_GET_PROFILE, id),
  create: (request) => invoke(IpcChannels.TEACHER_CREATE, request),
  update: (request) => invoke(IpcChannels.TEACHER_UPDATE, request),
  setActive: (request) => invoke(IpcChannels.TEACHER_SET_ACTIVE, request),
  listAssignments: (id) => invoke(IpcChannels.TEACHER_LIST_ASSIGNMENTS, id),
  assign: (request) => invoke(IpcChannels.TEACHER_ASSIGN, request),
  updateAssignment: (request) => invoke(IpcChannels.TEACHER_UPDATE_ASSIGNMENT, request),
  removeAssignment: (request) => invoke(IpcChannels.TEACHER_REMOVE_ASSIGNMENT, request),
};
