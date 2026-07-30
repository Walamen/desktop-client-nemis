import { IpcChannels } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertNoArgs } from '@app/security/validateIpc';

export function registerSchoolHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.SCHOOL_GET_SUMMARY, assertNoArgs, async () => {
    const res = await app.institution.getCurrentSchool();
    return res.data;
  });
}
