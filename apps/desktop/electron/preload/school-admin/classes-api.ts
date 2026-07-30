import { IpcChannels } from '@nemis-desktop/types';
import type { ClassesApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const classesApi: ClassesApi = {
  list: (request) => invoke(IpcChannels.CLASS_LIST, request),
  create: (request) => invoke(IpcChannels.CLASS_CREATE, request),
  update: (request) => invoke(IpcChannels.CLASS_UPDATE, request),
  setActive: (request) => invoke(IpcChannels.CLASS_SET_ACTIVE, request),
  gradeLevelCounts: () => invoke(IpcChannels.CLASS_GRADE_LEVEL_COUNTS),
  listSubjects: (classId) => invoke(IpcChannels.CLASS_SUBJECT_LIST, classId),
  assignSubject: (request) => invoke(IpcChannels.CLASS_SUBJECT_ASSIGN, request),
  unassignSubject: (request) => invoke(IpcChannels.CLASS_SUBJECT_UNASSIGN, request),
};
