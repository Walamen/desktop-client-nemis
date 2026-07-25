import { ipcMain } from 'electron';
import type { IpcChannel, IpcContract, IpcResult } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import { logger } from '@app/services/logger';
import { registerSystemHandlers } from '@app/ipc/handlers/system';
import type { DataLayer } from '@app/data/factories/createDataLayer';
import { registerSettingsHandlers } from '@app/ipc/handlers/settings';
import { registerDashboardHandlers } from '@app/ipc/handlers/dashboard';
import { registerSchoolHandlers } from '@app/ipc/handlers/school';
import { registerAcademicYearHandlers } from '@app/ipc/handlers/academicYear';
import { registerTermHandlers } from '@app/ipc/handlers/term';
import { registerClassHandlers } from '@app/ipc/handlers/classes';
import { registerSubjectHandlers } from '@app/ipc/handlers/subject';
import { registerIdentityHandlers } from '@app/ipc/handlers/identity';
import { registerDeviceHandlers } from '@app/ipc/handlers/device';
import { registerStudentHandlers } from '@app/ipc/handlers/students';
import { registerTeacherHandlers } from '@app/ipc/handlers/teachers';
import { registerProvisioningHandlers } from '@app/ipc/handlers/provisioning';
import { registerTimetableHandlers } from '@app/ipc/handlers/timetables';
import { registerAttendanceHandlers } from '@app/ipc/handlers/attendance';
import type { ProvisioningService } from '@app/provisioning/ProvisioningService';
import { toIpcError } from './errorMapping';
import { registerSyncHandlers } from '@app/ipc/handlers/sync';
import type { DesktopSyncWorker } from '@app/sync/DesktopSyncWorker';
import type { SchoolAdminModuleService } from '@app/data/services/SchoolAdminModuleService';
import { registerSchoolAdminHandlers } from '@app/ipc/handlers/schoolAdmin';
import type { WorkspaceManager } from '@app/workspace/WorkspaceManager';
import { authorizeChannel } from './authorizeChannel';

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
  registerDashboardHandlers(securedHandle, app);
  registerSchoolHandlers(securedHandle, app);
  registerAcademicYearHandlers(securedHandle, app);
  registerTermHandlers(securedHandle, app);
  registerClassHandlers(securedHandle, app);
  registerSubjectHandlers(securedHandle, app);
  registerIdentityHandlers(securedHandle, app);
  registerDeviceHandlers(securedHandle, app);
  registerStudentHandlers(securedHandle, app);
  registerTeacherHandlers(securedHandle, app);
  registerTimetableHandlers(securedHandle, app);
  registerAttendanceHandlers(securedHandle, app);
  registerSchoolAdminHandlers(securedHandle, schoolAdmin);
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
