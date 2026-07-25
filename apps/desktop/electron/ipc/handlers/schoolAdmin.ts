import { IpcChannels } from '@nemis-desktop/types';
import {
  assertSchoolAdminDeleteArgs,
  assertSchoolAdminListArgs,
  assertSchoolAdminSaveArgs,
} from '@app/security/validateIpc';
import type { SchoolAdminModuleService } from '@app/data/services/SchoolAdminModuleService';
import type { IpcHandle } from '../registrar';

export function registerSchoolAdminHandlers(
  handle: IpcHandle,
  service: SchoolAdminModuleService,
): void {
  handle(IpcChannels.SCHOOL_ADMIN_LIST, assertSchoolAdminListArgs, (request) =>
    service.list(request),
  );
  handle(IpcChannels.SCHOOL_ADMIN_SAVE, assertSchoolAdminSaveArgs, (request) =>
    service.save(request),
  );
  handle(IpcChannels.SCHOOL_ADMIN_DELETE, assertSchoolAdminDeleteArgs, (request) =>
    service.delete(request),
  );
}
