import { IpcChannels } from '@nemis-desktop/types';
import type { IdentityApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const identityApi: IdentityApi = {
  getCurrentUser: () => invoke(IpcChannels.IDENTITY_GET_CURRENT_USER),
};
