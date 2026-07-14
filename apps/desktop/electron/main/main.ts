import { app, BrowserWindow } from 'electron';
import started from 'electron-squirrel-startup';
import { loadConfig } from '@app/config/env';
import { initLogger, logger } from '@app/services/logger';
import { createMainWindow } from '@app/windows/mainWindow';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const config = loadConfig();

app.whenReady().then(() => {
  initLogger({ isDev: config.isDev, level: config.logLevel });
  logger.info(`NEMIS Desktop starting (dev=${config.isDev})`);

  createMainWindow(config);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow(config);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
