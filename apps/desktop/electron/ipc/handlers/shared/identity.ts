import { IpcChannels } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertNoArgs } from '@app/security/validateIpc';

export function registerIdentityHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.IDENTITY_GET_CURRENT_USER, assertNoArgs, async () => {
    const res = await app.identity.getCurrentUser();
    return res.data;
  });
  handle(IpcChannels.IDENTITY_HEADER_NOTIFICATIONS, assertNoArgs, async () => {
    const res = await app.identity.getHeaderNotifications();
    return res.data;
  });
}
