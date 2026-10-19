import type {
  CountyActivationLink,
  CountyAssignUserRequest,
  CountyBulkCreateUsersResult,
  CountyBulkUserRow,
  CountyCreateUserRequest,
  CountyCreateUserResult,
  CountySetUserActiveRequest,
  CountyUserOptions,
  CountyUsersQuery,
  CountyUsersResult,
  OnlineCommandResult,
} from '@nemis-desktop/types';
import { api } from '../api';

export const usersBridge = {
  listUsers: (query: CountyUsersQuery): Promise<CountyUsersResult> => api().county.listUsers(query),
  getUserOptions: (): Promise<CountyUserOptions> => api().county.getUserOptions(),
  setUserActive: (request: CountySetUserActiveRequest): Promise<OnlineCommandResult<null>> =>
    api().county.setUserActive(request),
  assignUser: (request: CountyAssignUserRequest): Promise<OnlineCommandResult<null>> =>
    api().county.assignUser(request),
  getActivationLink: (userId: string): Promise<OnlineCommandResult<CountyActivationLink>> =>
    api().county.getActivationLink(userId),
  createUser: (request: CountyCreateUserRequest): Promise<OnlineCommandResult<CountyCreateUserResult>> =>
    api().county.createUser(request),
  bulkCreateUsers: (rows: CountyBulkUserRow[]): Promise<OnlineCommandResult<CountyBulkCreateUsersResult>> =>
    api().county.bulkCreateUsers(rows),
};
