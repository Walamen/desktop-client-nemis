import { IpcChannels } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import {
  assertNoArgs,
  assertSingleIdArg,
  assertCreateAcademicYearArgs,
  assertUpdateAcademicYearArgs,
  assertSetAcademicYearStatusArgs,
} from '@app/security/validateIpc';

export function registerAcademicYearHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.ACADEMIC_YEAR_GET_CURRENT, assertNoArgs, async () => {
    const res = await app.academics.getCurrentAcademicYear();
    return res.data;
  });

  handle(IpcChannels.ACADEMIC_YEAR_LIST, assertNoArgs, async () => {
    const res = await app.academics.listAcademicYears();
    return res.data;
  });

  handle(IpcChannels.ACADEMIC_YEAR_CREATE, assertCreateAcademicYearArgs, async (request) => {
    const res = await app.academics.createAcademicYear(request);
    return res.data;
  });

  handle(IpcChannels.ACADEMIC_YEAR_UPDATE, assertUpdateAcademicYearArgs, async (request) => {
    const res = await app.academics.updateAcademicYear(request);
    return res.data;
  });

  handle(IpcChannels.ACADEMIC_YEAR_SET_CURRENT, assertSingleIdArg, async (id) => {
    const res = await app.academics.setCurrentAcademicYear({ id });
    return res.data;
  });

  handle(
    IpcChannels.ACADEMIC_YEAR_SET_STATUS,
    assertSetAcademicYearStatusArgs,
    async (request) => {
      const res = await app.academics.setAcademicYearStatus(request);
      return res.data;
    },
  );
}
