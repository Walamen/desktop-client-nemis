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
import type { ProvisioningService } from '@app/provisioning/ProvisioningService';
import { toIpcError } from './errorMapping';

export type IpcValidator = (args: readonly unknown[]) => void;

export function registerIpcHandlers(
  services: DataLayer['services'],
  app: ApplicationLayer,
  provisioning: ProvisioningService,
): void {
  registerProvisioningHandlers(handle, provisioning);
  registerSystemHandlers(handle);
  registerSettingsHandlers(handle, services.appSettings);
  registerDashboardHandlers(handle, app);
  registerSchoolHandlers(handle, app);
  registerAcademicYearHandlers(handle, app);
  registerTermHandlers(handle, app);
  registerClassHandlers(handle, app);
  registerSubjectHandlers(handle, app);
  registerIdentityHandlers(handle, app);
  registerDeviceHandlers(handle, app);
  registerStudentHandlers(handle, app);
  registerTeacherHandlers(handle, app);
}

/**
 * Binds a channel with mandatory input validation and error mapping.
 * Handlers never throw across the wire: every response is an IpcResult<T>,
 * and unknown errors are masked before reaching the renderer.
 */
function handle<C extends IpcChannel>(
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

export type IpcHandle = typeof handle;
