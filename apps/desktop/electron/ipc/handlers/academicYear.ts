import { IpcChannels } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertNoArgs } from '@app/security/validateIpc';

export function registerAcademicYearHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.ACADEMIC_YEAR_GET_CURRENT, assertNoArgs, async () => {
    const res = await app.academics.getCurrentAcademicYear();
    return res.data;
  });
}
