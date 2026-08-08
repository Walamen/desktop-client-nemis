import { IpcChannels } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertNoArgs } from '@app/security/validateIpc';

// Role-agnostic: the local database is already scoped to whatever the
// backend authorized for this device's role, so the same handler is correct
// for School Admin, Teacher, County, DEO, and Ministry alike.
export function registerInstitutionHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.INSTITUTION_LIST, assertNoArgs, async () => {
    const res = await app.institution.listInstitutions();
    return res.data;
  });
}
