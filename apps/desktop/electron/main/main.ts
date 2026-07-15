import os from 'node:os';
import { app, BrowserWindow, dialog } from 'electron';
import started from 'electron-squirrel-startup';
import { loadConfig } from '@app/config/env';
import { DatabaseManager } from '@app/database/DatabaseManager';
import { registerIpcHandlers } from '@app/ipc/registrar';
import { initLogger, logger } from '@app/services/logger';
import { hardenWebContents } from '@app/security/hardenWindow';
import { denyPermissionRequests, denyPermissionChecks } from '@app/security/permissions';
import { installProcessSafetyNets } from '@app/main/safetyNets';
import { createMainWindow, RENDERER_ORIGIN } from '@app/windows/mainWindow';
import { registerAppProtocolScheme, registerAppProtocolHandler } from '@app/main/appProtocol';

// Squirrel.Windows shortcut events during install/update: quit immediately.
if (started) {
  app.quit();
} else if (!app.requestSingleInstanceLock()) {
  // Another instance is already running; it will focus itself.
  app.quit();
} else {
  bootstrap();
}

function bootstrap(): void {
  installProcessSafetyNets();

  const config = loadConfig();

  if (!config.isDev) {
    registerAppProtocolScheme();
  }

  let mainWindow: BrowserWindow | null = null;
  let databaseManager: DatabaseManager | null = null;
  const allowedOrigins = config.isDev ? [config.rendererDevUrl] : [RENDERER_ORIGIN];

  const createHardenedWindow = (): BrowserWindow => {
    const window = createMainWindow(config);
    hardenWebContents(window.webContents, allowedOrigins);
    window.on('closed', () => {
      if (mainWindow === window) {
        mainWindow = null;
      }
    });
    return window;
  };

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app
    .whenReady()
    .then(() => {
      initLogger({ isDev: config.isDev, level: config.logLevel });
      logger.info(`NEMIS Desktop starting (dev=${config.isDev})`);

      databaseManager = new DatabaseManager({
        userDataDir: app.getPath('userData'),
        device: {
          deviceName: os.hostname(),
          platform: process.platform,
          osVersion: os.release(),
          appVersion: app.getVersion(),
        },
        log: {
          info: (message) => logger.info(message),
          warn: (message) => logger.warn(message),
          error: (message, error) => logger.error(message, error),
        },
      });
      databaseManager.initialize();

      denyPermissionRequests();
      denyPermissionChecks();

      if (!config.isDev) {
        registerAppProtocolHandler();
      }

      registerIpcHandlers();

      mainWindow = createHardenedWindow();

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          mainWindow = createHardenedWindow();
        }
      });
    })
    .catch((error: unknown) => {
      logger.error('Fatal startup failure:', error);
      dialog.showErrorBox(
        'NEMIS Desktop',
        'The application could not start because the local database failed to open. ' +
          'Please contact support and provide the application logs.',
      );
      app.quit();
    });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('will-quit', () => {
    try {
      databaseManager?.shutdown();
    } catch (error) {
      logger.error('Database shutdown failed:', error);
    }
  });
}
