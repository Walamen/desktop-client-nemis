import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannels } from '@nemis-desktop/types';
import type { IpcChannel, IpcResult, NemisApi } from '@nemis-desktop/types';

async function invoke<T>(channel: IpcChannel): Promise<T> {
  const result = (await ipcRenderer.invoke(channel)) as IpcResult<T>;
  if (!result.ok) {
    throw new Error(`[${result.error.code}] ${result.error.message}`);
  }
  return result.data;
}

const nemisApi: NemisApi = {
  system: {
    getVersion: () => invoke<string>(IpcChannels.SYSTEM_GET_VERSION),
  },
};

contextBridge.exposeInMainWorld('nemis', nemisApi);
