import { IpcChannels } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertNoArgs, assertSingleIdArg } from '@app/security/validateIpc';

export function registerCountyDistrictHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.COUNTY_LIST_DISTRICTS, assertNoArgs, async () => {
    const res = await app.county.listDistricts();
    return res.data;
  });
  handle(IpcChannels.COUNTY_GET_DISTRICT, assertSingleIdArg, async (districtId: string) => {
    const res = await app.county.getDistrict(districtId);
    return res.data;
  });
}
