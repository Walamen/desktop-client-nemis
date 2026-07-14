import { ipcMain } from 'electron';
import type { IpcChannel, IpcContract, IpcResult } from '@nemis-desktop/types';
import { toIpcErrorPayload } from '@nemis-desktop/shared';
import { logger } from '@app/services/logger';
import { registerSystemHandlers } from '@app/ipc/handlers/system';

export type IpcValidator = (args: readonly unknown[]) => void;

export function registerIpcHandlers(): void {
  registerSystemHandlers(handle);
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
      return { ok: true, data: await handler(...(args as IpcContract[C]['args'])) };
    } catch (error) {
      logger.error(`IPC handler failed for channel "${channel}"`, error);
      return { ok: false, error: toIpcErrorPayload(error) };
    }
  });
}

export type IpcHandle = typeof handle;
