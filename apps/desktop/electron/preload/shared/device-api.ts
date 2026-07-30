import { IpcChannels } from '@nemis-desktop/types';
import type { DeviceApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const deviceApi: DeviceApi = {
  getInfo: () => invoke(IpcChannels.DEVICE_GET_INFO),
};
