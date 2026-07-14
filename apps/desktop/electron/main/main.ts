import { app, BrowserWindow } from 'electron';
import started from 'electron-squirrel-startup';
import { loadConfig } from '@app/config/env';
import { registerIpcHandlers } from '@app/ipc/registrar';
import { initLogger, logger } from '@app/services/logger';
import { hardenWebContents } from '@app/security/hardenWindow';
import { denyPermissionRequests } from '@app/security/permissions';
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

      denyPermissionRequests();

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
      app.quit();
    });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
