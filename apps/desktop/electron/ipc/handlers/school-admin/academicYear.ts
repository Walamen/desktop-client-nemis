import { IpcChannels } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { YearStructureCopyService } from '@app/data/services/YearStructureCopyService';
import type { IpcHandle } from '@app/ipc/registrar';
import type { BackendProvisioningGateway } from '@app/provisioning/BackendProvisioningGateway';
import {
  assertNoArgs,
  assertSingleIdArg,
  assertCopyYearStructureArgs,
  assertCreateAcademicYearArgs,
  assertUpdateAcademicYearArgs,
} from '@app/security/validateIpc';
import { runOnline } from './online';

export type AcademicYearGateway = Pick<BackendProvisioningGateway, 'startAcademicYear'>;

export function registerAcademicYearHandlers(
  handle: IpcHandle,
  app: ApplicationLayer,
  gateway: AcademicYearGateway,
  refresh: () => Promise<boolean>,
  yearStructure: Pick<YearStructureCopyService, 'copyStructure'>,
): void {
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

  // Online only: the server owns when a year starts (Stage 1); the forced
  // pull brings the new status back into local SQLite.
  handle(IpcChannels.ACADEMIC_YEAR_START, assertSingleIdArg, (id: string) =>
    runOnline(() => gateway.startAcademicYear(id), refresh),
  );

  // Offline: the rows go through the sync outbox like any other setup edit.
  handle(IpcChannels.ACADEMIC_YEAR_COPY_STRUCTURE, assertCopyYearStructureArgs, (request) =>
    yearStructure.copyStructure(request),
  );
}
