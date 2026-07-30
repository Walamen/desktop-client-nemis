import { ipcRenderer } from 'electron';
import type { IpcChannel, IpcContract, IpcResult } from '@nemis-desktop/types';

/** The single low-level caller every preload/*-api.ts file uses to reach the
 * main process. Unwraps IpcResult, throwing a `[CODE] message` Error on
 * failure — nemis-bridge/create-ipc-application-layer parses that prefix. */
export async function invoke<C extends IpcChannel>(
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
