import { IpcChannels } from '@nemis-desktop/types';
import type { SystemApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const systemApi: SystemApi = {
  getVersion: () => invoke(IpcChannels.SYSTEM_GET_VERSION),
};
