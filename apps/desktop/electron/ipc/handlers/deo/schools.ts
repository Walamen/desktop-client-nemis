import { IpcChannels } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertNoArgs } from '@app/security/validateIpc';

/** DEO Schools Management, from this device. The district comes from the
 * signed-in workspace, never from the renderer. */
export function registerDeoSchoolHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.DEO_LIST_SCHOOLS, assertNoArgs, async () => (await app.deo.listSchools()).data);
}
