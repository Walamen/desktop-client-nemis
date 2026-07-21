import { IpcChannels } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertNoArgs } from '@app/security/validateIpc';

export function registerDeviceHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.DEVICE_GET_INFO, assertNoArgs, async () => {
    const res = await app.infra.getDeviceInfo();
    return res.data;
  });
}
