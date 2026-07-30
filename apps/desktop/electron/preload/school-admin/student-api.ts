import { IpcChannels } from '@nemis-desktop/types';
import type { StudentApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const studentApi: StudentApi = {
  list: (request) => invoke(IpcChannels.STUDENT_LIST, request),
  get: (id) => invoke(IpcChannels.STUDENT_GET, id),
  create: (request) => invoke(IpcChannels.STUDENT_CREATE, request),
  update: (request) => invoke(IpcChannels.STUDENT_UPDATE, request),
  setActive: (request) => invoke(IpcChannels.STUDENT_SET_ACTIVE, request),
  createGuardian: (request) => invoke(IpcChannels.STUDENT_CREATE_GUARDIAN, request),
  enroll: (request) => invoke(IpcChannels.STUDENT_ENROLL, request),
  moveClass: (request) => invoke(IpcChannels.STUDENT_MOVE_CLASS, request),
  listEnrollments: (id) => invoke(IpcChannels.STUDENT_LIST_ENROLLMENTS, id),
  getStatistics: () => invoke(IpcChannels.STUDENT_GET_STATISTICS),
};
