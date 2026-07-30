import { IpcChannels } from '@nemis-desktop/types';
import type { SubjectApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const subjectApi: SubjectApi = {
  list: (request) => invoke(IpcChannels.SUBJECT_LIST, request),
  create: (request) => invoke(IpcChannels.SUBJECT_CREATE, request),
  update: (request) => invoke(IpcChannels.SUBJECT_UPDATE, request),
  setActive: (request) => invoke(IpcChannels.SUBJECT_SET_ACTIVE, request),
};
