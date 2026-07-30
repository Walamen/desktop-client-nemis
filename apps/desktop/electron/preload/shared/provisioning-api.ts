import { IpcChannels } from '@nemis-desktop/types';
import type { ProvisioningApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const provisioningApi: ProvisioningApi = {
  start: () => invoke(IpcChannels.PROVISIONING_START),
};
