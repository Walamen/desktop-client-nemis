import type { DeviceInfoResult } from '@nemis-desktop/types';
import { api } from '../api';

export const deviceBridge = {
  getDeviceInfo: (): Promise<DeviceInfoResult | null> => api().device.getInfo(),
};
