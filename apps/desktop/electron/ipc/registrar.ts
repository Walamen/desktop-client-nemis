import { ipcMain } from 'electron';
import type { IpcChannel, IpcContract, IpcResult } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import { logger } from '@app/services/logger';
import type { DataLayer } from '@app/data/factories/createDataLayer';
import type { ProvisioningService } from '@app/provisioning/ProvisioningService';
import { toIpcError } from './errorMapping';
import type { DesktopSyncWorker } from '@app/sync/DesktopSyncWorker';
import type { SchoolAdminModuleService } from '@app/data/services/SchoolAdminModuleService';
import type { WorkspaceManager } from '@app/workspace/WorkspaceManager';
import { authorizeChannel } from './authorizeChannel';

// Shared across every portal (auth, sync, current user, device, attendance,
// generic records) — see electron/ipc/handlers/shared/.
import { registerProvisioningHandlers } from '@app/ipc/handlers/shared/provisioning';
import { registerSystemHandlers } from '@app/ipc/handlers/shared/system';
import { registerSyncHandlers } from '@app/ipc/handlers/shared/sync';
import { registerSettingsHandlers } from '@app/ipc/handlers/shared/settings';
import { registerIdentityHandlers } from '@app/ipc/handlers/shared/identity';
import { registerDeviceHandlers } from '@app/ipc/handlers/shared/device';
import { registerAttendanceHandlers } from '@app/ipc/handlers/shared/attendance';
import { registerSchoolAdminHandlers } from '@app/ipc/handlers/shared/schoolAdmin';

// Institution Admin (school admin) portal — see
// electron/ipc/handlers/school-admin/.
import { registerDashboardHandlers } from '@app/ipc/handlers/school-admin/dashboard';
import { registerSchoolHandlers } from '@app/ipc/handlers/school-admin/school';
import { registerAcademicYearHandlers } from '@app/ipc/handlers/school-admin/academicYear';
import { registerTermHandlers } from '@app/ipc/handlers/school-admin/term';
import { registerClassHandlers } from '@app/ipc/handlers/school-admin/classes';
import { registerSubjectHandlers } from '@app/ipc/handlers/school-admin/subject';
import { registerStudentHandlers } from '@app/ipc/handlers/school-admin/students';
import { registerTeacherDirectoryHandlers } from '@app/ipc/handlers/school-admin/teacherDirectory';
import { registerTimetableHandlers } from '@app/ipc/handlers/school-admin/timetables';

// Teacher portal's own channels — see electron/ipc/handlers/teacher/.
import { registerTeacherDashboardHandlers } from '@app/ipc/handlers/teacher/dashboard';

export type IpcValidator = (args: readonly unknown[]) => void;

export function registerIpcHandlers(
  services: DataLayer['services'],
  app: ApplicationLayer,
  provisioning: ProvisioningService,
  syncWorker: DesktopSyncWorker,
  schoolAdmin: SchoolAdminModuleService,
  workspaces: WorkspaceManager,
): void {
  const securedHandle: IpcHandle = (channel, validate, handler) =>
    bind(
      channel,
      (args) => {
        authorizeChannel(channel, workspaces);
        validate(args);
      },
      handler,
    );

  registerProvisioningHandlers(securedHandle, provisioning);
  registerSystemHandlers(securedHandle);
  registerSyncHandlers(securedHandle, syncWorker);
  registerSettingsHandlers(securedHandle, services.appSettings);
  registerIdentityHandlers(securedHandle, app);
  registerDeviceHandlers(securedHandle, app);
  registerAttendanceHandlers(securedHandle, app);
  registerSchoolAdminHandlers(securedHandle, schoolAdmin);

  registerDashboardHandlers(securedHandle, app);
  registerSchoolHandlers(securedHandle, app);
  registerAcademicYearHandlers(securedHandle, app);
  registerTermHandlers(securedHandle, app);
  registerClassHandlers(securedHandle, app);
  registerSubjectHandlers(securedHandle, app);
  registerStudentHandlers(securedHandle, app);
  registerTeacherDirectoryHandlers(securedHandle, app);
  registerTimetableHandlers(securedHandle, app);

  registerTeacherDashboardHandlers(securedHandle, app);
}

/**
 * Binds a channel with mandatory input validation and error mapping.
 * Handlers never throw across the wire: every response is an IpcResult<T>,
 * and unknown errors are masked before reaching the renderer.
 */
function bind<C extends IpcChannel>(
  channel: C,
  validate: IpcValidator,
  handler: (
    ...args: IpcContract[C]['args']
  ) => IpcContract[C]['result'] | Promise<IpcContract[C]['result']>,
): void {
  ipcMain.handle(channel, async (_event, ...args): Promise<IpcResult<IpcContract[C]['result']>> => {
    try {
      validate(args);
      // arity: the cast below is safe only because `validate` has already
      // enforced this channel's exact argument count and shapes.
      return { ok: true, data: await handler(...(args as IpcContract[C]['args'])) };
    } catch (error) {
      logger.error(`IPC handler failed for channel "${channel}"`, error);
      return { ok: false, error: toIpcError(error) };
    }
  });
}

export type IpcHandle = typeof bind;
