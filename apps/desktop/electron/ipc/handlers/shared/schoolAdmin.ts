import { IpcChannels } from '@nemis-desktop/types';
import {
  assertSchoolAdminDeleteArgs,
  assertSchoolAdminListArgs,
  assertSchoolAdminSaveArgs,
} from '@app/security/validateIpc';
import type { SchoolAdminModuleService } from '@app/data/services/SchoolAdminModuleService';
import type { IpcHandle } from '@app/ipc/registrar';

/** Generic per-institution collection store — despite the "schoolAdmin"
 * channel name it's used by finance, messaging, notifications, reports and
 * grading across every portal. See
 * services/nemis-bridge/shared/collections-bridge.ts on the renderer side. */
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
