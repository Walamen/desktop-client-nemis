import { IpcChannels } from '@nemis-desktop/types';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertNoArgs } from '@app/security/validateIpc';
import { getAppVersion } from '@app/services/systemService';

export function registerSystemHandlers(handle: IpcHandle): void {
  handle(IpcChannels.SYSTEM_GET_VERSION, assertNoArgs, () => getAppVersion());
}
