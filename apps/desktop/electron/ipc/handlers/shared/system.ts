import { IpcChannels } from '@nemis-desktop/types';
import type { IpcHandle } from '@app/ipc/registrar';
import { app, BrowserWindow, dialog } from 'electron';
import { promises as fs } from 'node:fs';
import { assertNoArgs, assertSaveFileArgs } from '@app/security/validateIpc';
import { getAppVersion } from '@app/services/systemService';
import { saveFileWithDialog } from '@app/services/fileSaveService';

export function registerSystemHandlers(handle: IpcHandle): void {
  handle(IpcChannels.SYSTEM_GET_VERSION, assertNoArgs, () => getAppVersion());
  // Report exports: the user picks where; nothing is written on cancel.
  handle(IpcChannels.SYSTEM_SAVE_FILE, assertSaveFileArgs, (request) =>
    saveFileWithDialog(request, {
      showSaveDialog: (options) => {
        const window = BrowserWindow.getFocusedWindow();
        return window ? dialog.showSaveDialog(window, options) : dialog.showSaveDialog(options);
      },
      writeFile: (filePath, bytes) => fs.writeFile(filePath, bytes),
      downloadsDir: () => app.getPath('downloads'),
    }),
  );
}
