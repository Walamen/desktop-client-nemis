import { ipcMain } from 'electron';
import { IpcChannels } from '@nemis-desktop/types';
import type { IpcChannel, IpcResult } from '@nemis-desktop/types';
import { toIpcErrorPayload } from '@nemis-desktop/shared';
import { logger } from '@app/services/logger';
import { assertNoArgs } from '@app/security/validateIpc';
import { getAppVersion } from '@app/services/systemService';

type Validator = (args: readonly unknown[]) => void;

export function registerIpcHandlers(): void {
  handle(IpcChannels.SYSTEM_GET_VERSION, assertNoArgs, () => getAppVersion());
}

/**
 * Binds a channel with mandatory input validation and error mapping.
 * Handlers never leak raw errors: everything crosses IPC as IpcResult<T>.
 */
function handle<T>(channel: IpcChannel, validate: Validator, handler: () => T | Promise<T>): void {
  ipcMain.handle(channel, async (_event, ...args): Promise<IpcResult<T>> => {
    try {
      validate(args);
      return { ok: true, data: await handler() };
    } catch (error) {
      logger.error(`IPC handler failed for channel "${channel}"`, error);
      return { ok: false, error: toIpcErrorPayload(error) };
    }
  });
}
