import { IpcChannels } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertNoArgs, assertSingleIdArg } from '@app/security/validateIpc';

export function registerCountySchoolHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.COUNTY_LIST_SCHOOLS, assertNoArgs, async () => {
    const res = await app.county.listSchools();
    return res.data;
  });
  handle(IpcChannels.COUNTY_GET_SCHOOL, assertSingleIdArg, async (schoolId: string) => {
    const res = await app.county.getSchool(schoolId);
    return res.data;
  });
}
