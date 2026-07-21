import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannels } from '@nemis-desktop/types';
import type { IpcChannel, IpcContract, IpcResult, NemisApi } from '@nemis-desktop/types';

async function invoke<C extends IpcChannel>(
  channel: C,
  ...args: IpcContract[C]['args']
): Promise<IpcContract[C]['result']> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<
    IpcContract[C]['result']
  >;
  if (!result.ok) {
    throw new Error(`[${result.error.code}] ${result.error.message}`);
  }
  return result.data;
}

const nemisApi: NemisApi = {
  system: {
    getVersion: () => invoke(IpcChannels.SYSTEM_GET_VERSION),
  },
  settings: {
    get: (key: string) => invoke(IpcChannels.SETTINGS_GET, key),
  },
  dashboard: {
    getOverview: () => invoke(IpcChannels.DASHBOARD_GET_OVERVIEW),
  },
  school: {
    getSummary: () => invoke(IpcChannels.SCHOOL_GET_SUMMARY),
  },
  academicYear: {
    getCurrent: () => invoke(IpcChannels.ACADEMIC_YEAR_GET_CURRENT),
  },
  identity: {
    getCurrentUser: () => invoke(IpcChannels.IDENTITY_GET_CURRENT_USER),
  },
  device: {
    getInfo: () => invoke(IpcChannels.DEVICE_GET_INFO),
  },
};

contextBridge.exposeInMainWorld('nemis', nemisApi);
