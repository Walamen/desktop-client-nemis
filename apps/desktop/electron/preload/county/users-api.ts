import { IpcChannels } from '@nemis-desktop/types';
import type { CountyApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const countyUsersApi: Pick<
  CountyApi,
  'listUsers' | 'getUserOptions' | 'setUserActive' | 'assignUser' | 'getActivationLink' | 'createUser' | 'bulkCreateUsers'
> = {
  listUsers: (query) => invoke(IpcChannels.COUNTY_LIST_USERS, query),
  getUserOptions: () => invoke(IpcChannels.COUNTY_GET_USER_OPTIONS),
  setUserActive: (request) => invoke(IpcChannels.COUNTY_SET_USER_ACTIVE, request),
  assignUser: (request) => invoke(IpcChannels.COUNTY_ASSIGN_USER, request),
  getActivationLink: (userId) => invoke(IpcChannels.COUNTY_GET_ACTIVATION_LINK, userId),
  createUser: (request) => invoke(IpcChannels.COUNTY_CREATE_USER, request),
  bulkCreateUsers: (rows) => invoke(IpcChannels.COUNTY_BULK_CREATE_USERS, rows),
};
