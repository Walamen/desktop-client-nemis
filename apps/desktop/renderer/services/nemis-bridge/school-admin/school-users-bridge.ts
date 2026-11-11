import type {
  CreateSchoolUserRequest,
  CreateSchoolUserResult,
  OnlineCommandResult,
  SchoolOfficeUser,
  SchoolUsersResult,
  SetSchoolUserActiveRequest,
  UpdateSchoolUserRequest,
} from '@nemis-desktop/types';
import { api } from '../api';

/** Users & Access (School Admin only). The list comes from the server when
 * online, else from the accounts stored on this device (`source: 'device'`).
 * Every change is an online command; a refusal rejects with the server message. */
export const schoolUsersBridge = {
  list: (): Promise<SchoolUsersResult> => api().schoolUsers.list(),
  create: (request: CreateSchoolUserRequest): Promise<OnlineCommandResult<CreateSchoolUserResult>> =>
    api().schoolUsers.create(request),
  update: (request: UpdateSchoolUserRequest): Promise<OnlineCommandResult<SchoolOfficeUser>> =>
    api().schoolUsers.update(request),
  setActive: (request: SetSchoolUserActiveRequest): Promise<OnlineCommandResult<SchoolOfficeUser>> =>
    api().schoolUsers.setActive(request),
};
