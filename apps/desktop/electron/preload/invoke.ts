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
    // An Error crossing the context bridge keeps only its message, so the
    // fields of a validation refusal ride on it after a unit separator;
    // parseIpcError strips them back off.
    const fields = (result.error.issues ?? []).map((issue) => issue.field).join(',');
    throw new Error(`[${result.error.code}] ${result.error.message}${fields ? `\u001F${fields}` : ''}`);
  }
  return result.data;
}
