import { IpcChannels } from '@nemis-desktop/types';
import type { SchoolUsersApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

/** Users & Access (School Admin only). */
export const schoolUsersApi: SchoolUsersApi = {
  list: () => invoke(IpcChannels.SCHOOL_USERS_LIST),
  create: (request) => invoke(IpcChannels.SCHOOL_USERS_CREATE, request),
  update: (request) => invoke(IpcChannels.SCHOOL_USERS_UPDATE, request),
  setActive: (request) => invoke(IpcChannels.SCHOOL_USERS_SET_ACTIVE, request),
};
