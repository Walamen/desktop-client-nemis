import os from 'node:os';
import { app, BrowserWindow, dialog } from 'electron';
import started from 'electron-squirrel-startup';
import { loadConfig } from '@app/config/env';
import { DatabaseError } from '@app/database/errors/errors';
import { registerIpcHandlers } from '@app/ipc/registrar';
import { initLogger, logger } from '@app/services/logger';
import { hardenWebContents } from '@app/security/hardenWindow';
import { denyPermissionRequests, denyPermissionChecks } from '@app/security/permissions';
import { loadOrCreateDatabaseKey } from '@app/security/databaseKey';
import { installProcessSafetyNets } from '@app/main/safetyNets';
import { createMainWindow, RENDERER_ORIGIN } from '@app/windows/mainWindow';
import { registerAppProtocolScheme, registerAppProtocolHandler } from '@app/main/appProtocol';
import { AuthenticateUser, Logout, RestoreSession } from '@nemis-desktop/application';
import { BackendAuthenticationGateway } from '@app/provisioning/BackendAuthenticationGateway';
import { EncryptedSessionRepository } from '@app/provisioning/EncryptedSessionRepository';
import { ProvisioningService } from '@app/provisioning/ProvisioningService';
import { loadDeviceIdentity } from '@app/provisioning/deviceIdentity';
import { BackendProvisioningGateway } from '@app/provisioning/BackendProvisioningGateway';
import { ProvisioningImporter } from '@app/provisioning/ProvisioningImporter';
import { WorkspaceManager } from '@app/workspace/WorkspaceManager';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { DataLayer } from '@app/data/factories/createDataLayer';
import { DesktopSyncWorker } from '@app/sync/DesktopSyncWorker';
import { SchoolAdminModuleService } from '@app/data/services/SchoolAdminModuleService';

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
  let workspaces: WorkspaceManager | null = null;
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

      const databaseLog = {
        info: (message: string) => logger.info(message),
        warn: (message: string) => logger.warn(message),
        error: (message: string, error?: unknown) => logger.error(message, error),
      };
      const encryptionKey = loadOrCreateDatabaseKey(app.getPath('userData'));
      const deviceInfo = {
        deviceName: os.hostname(),
        platform: process.platform,
        osVersion: os.release(),
        appVersion: app.getVersion(),
      };
      workspaces = new WorkspaceManager({
        userDataDir: app.getPath('userData'),
        masterKey: encryptionKey,
        device: deviceInfo,
        log: databaseLog,
      });
      const application = deferredApplication(() => workspaces!.active.application);
      const services = {
        appSettings: deferredMember(() => workspaces!.active.data.services, 'appSettings'),
      } as DataLayer['services'];
      const sessionRepository = new EncryptedSessionRepository(app.getPath('userData'));
      const authenticationGateway = new BackendAuthenticationGateway(config.apiBaseUrl);
      const backendProvisioning = new BackendProvisioningGateway(
        config.apiBaseUrl,
        authenticationGateway,
        sessionRepository,
      );
      const provisioning = new ProvisioningService(
        new AuthenticateUser(authenticationGateway, sessionRepository),
        new RestoreSession(authenticationGateway, sessionRepository),
        new Logout(authenticationGateway, sessionRepository),
        backendProvisioning,
        new ProvisioningImporter(() => workspaces!.active.database),
        loadDeviceIdentity(app.getPath('userData')),
        workspaces,
      );
      const syncWorker = new DesktopSyncWorker(workspaces, backendProvisioning);
      const schoolAdmin = new SchoolAdminModuleService(workspaces);
      const syncTimer = setInterval(() => {
        void syncWorker.syncActive().catch((error) => logger.warn(`Background sync deferred: ${String(error)}`));
      }, 30_000);

      denyPermissionRequests();
      denyPermissionChecks();

      if (!config.isDev) {
        registerAppProtocolHandler();
      }

      registerIpcHandlers(services, application, provisioning, syncWorker, schoolAdmin, workspaces);

      mainWindow = createHardenedWindow();
      void syncWorker.syncActive().catch(() => undefined);

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          mainWindow = createHardenedWindow();
        }
      });
      app.once('will-quit', () => clearInterval(syncTimer));
    })
    .catch((error: unknown) => {
      logger.error('Fatal startup failure:', error);
      const message =
        error instanceof DatabaseError
          ? 'The application could not start because the local database failed to open. ' +
            'Please contact support and provide the application logs.'
          : 'The application could not start due to an unexpected error. ' +
            'Please contact support and provide the application logs.';
      dialog.showErrorBox('NEMIS Desktop', message);
      app.quit();
    });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('will-quit', () => {
    try {
      workspaces?.close();
    } catch (error) {
      logger.error('Database shutdown failed:', error);
    }
  });
}

function deferredApplication(get: () => ApplicationLayer): ApplicationLayer {
  return {
    students: deferredMember(get, 'students'),
    academics: deferredMember(get, 'academics'),
    attendance: deferredMember(get, 'attendance'),
    assessments: deferredMember(get, 'assessments'),
    identity: deferredMember(get, 'identity'),
    institution: deferredMember(get, 'institution'),
    infra: deferredMember(get, 'infra'),
    reporting: deferredMember(get, 'reporting'),
    teachers: deferredMember(get, 'teachers'),
    timetables: deferredMember(get, 'timetables'),
  };
}

function deferredMember<T extends object, K extends keyof T>(
  get: () => T,
  key: K,
): T[K] {
  return new Proxy({} as object, {
    get(_target, property) {
      const member = get()[key] as object;
      const value = Reflect.get(member, property);
      return typeof value === 'function' ? value.bind(member) : value;
    },
  }) as T[K];
}
