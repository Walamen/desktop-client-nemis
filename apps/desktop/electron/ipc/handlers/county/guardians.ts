import { IpcChannels, type CountyGuardiansQuery } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertCountyGuardiansQueryArgs, assertSingleIdArg } from '@app/security/validateIpc';

/** County Parents & Guardians list and parent profile, read from this device. */
export function registerCountyGuardianHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.COUNTY_LIST_GUARDIANS, assertCountyGuardiansQueryArgs, async (query: CountyGuardiansQuery) =>
    (await app.county.listGuardians(query)).data,
  );
  handle(IpcChannels.COUNTY_GET_GUARDIAN, assertSingleIdArg, async (guardianId: string) =>
    (await app.county.getGuardian(guardianId)).data,
  );
}
