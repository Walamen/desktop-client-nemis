import { IpcChannels } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertNoArgs } from '@app/security/validateIpc';

/** DEO School Admin Directory, from this device. The district comes from
 * the signed-in workspace, never from the renderer. */
export function registerDeoSchoolAdminHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.DEO_LIST_SCHOOL_ADMINS, assertNoArgs, async () => (await app.deo.listSchoolAdmins()).data);
}
