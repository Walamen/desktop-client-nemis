import { app, BrowserWindow } from 'electron';
import started from 'electron-squirrel-startup';
import { loadConfig } from '@app/config/env';
import { registerIpcHandlers } from '@app/ipc/registrar';
import { initLogger, logger } from '@app/services/logger';
import { hardenWebContents } from '@app/security/hardenWindow';
import { createMainWindow, RENDERER_ORIGIN } from '@app/windows/mainWindow';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const config = loadConfig();

app.whenReady().then(() => {
  initLogger({ isDev: config.isDev, level: config.logLevel });
  logger.info(`NEMIS Desktop starting (dev=${config.isDev})`);

  registerIpcHandlers();

  const allowedUrlPrefixes = config.isDev ? [config.rendererDevUrl] : [RENDERER_ORIGIN];

  const mainWindow = createMainWindow(config);
  hardenWebContents(mainWindow.webContents, allowedUrlPrefixes);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const window = createMainWindow(config);
      hardenWebContents(window.webContents, allowedUrlPrefixes);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
