import { IpcChannels } from '@nemis-desktop/types';
import type { AuthenticationApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const authApi: AuthenticationApi = {
  getStatus: () => invoke(IpcChannels.AUTH_GET_STATUS),
  login: (request) => invoke(IpcChannels.AUTH_LOGIN, request),
  logout: () => invoke(IpcChannels.AUTH_LOGOUT),
};
