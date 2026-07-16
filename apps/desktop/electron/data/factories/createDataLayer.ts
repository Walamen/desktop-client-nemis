import type { DatabaseLogger, DatabaseManager } from '../../database/DatabaseManager';
import { createRepositoryContext } from '../repositories/base/RepositoryContext';
import type { IAppSettingsRepository } from '../repositories/interfaces/IAppSettingsRepository';
import type { IAuditLogRepository } from '../repositories/interfaces/IAuditLogRepository';
import type { IDeviceRepository } from '../repositories/interfaces/IDeviceRepository';
import type { ISyncMetadataRepository } from '../repositories/interfaces/ISyncMetadataRepository';
import type { ISyncQueueRepository } from '../repositories/interfaces/ISyncQueueRepository';
import { SqliteAppSettingsRepository } from '../repositories/sqlite/SqliteAppSettingsRepository';
import { SqliteAuditLogRepository } from '../repositories/sqlite/SqliteAuditLogRepository';
import { SqliteDeviceRepository } from '../repositories/sqlite/SqliteDeviceRepository';
import { SqliteSyncMetadataRepository } from '../repositories/sqlite/SqliteSyncMetadataRepository';
import { SqliteSyncQueueRepository } from '../repositories/sqlite/SqliteSyncQueueRepository';
import { AppSettingsService } from '../services/AppSettingsService';
import { AuditLogService } from '../services/AuditLogService';
import { DeviceService } from '../services/DeviceService';
import { SyncMetadataService } from '../services/SyncMetadataService';
import { SyncQueueService } from '../services/SyncQueueService';

export interface DataLayer {
  repositories: {
    devices: IDeviceRepository;
    appSettings: IAppSettingsRepository;
    syncMetadata: ISyncMetadataRepository;
    syncQueue: ISyncQueueRepository;
    auditLog: IAuditLogRepository;
  };
  services: {
    device: DeviceService;
    appSettings: AppSettingsService;
    syncMetadata: SyncMetadataService;
    syncQueue: SyncQueueService;
    auditLog: AuditLogService;
  };
}

/**
 * Composition root of the data layer. Called once from main.ts after
 * DatabaseManager.initialize(); everything downstream receives interfaces,
 * never concrete SQLite classes.
 */
export function createDataLayer(manager: DatabaseManager, log: DatabaseLogger): DataLayer {
  const context = createRepositoryContext(manager, log);

  const devices = new SqliteDeviceRepository(context);
  const appSettings = new SqliteAppSettingsRepository(context);
  const syncMetadata = new SqliteSyncMetadataRepository(context);
  const syncQueue = new SqliteSyncQueueRepository(context);
  const auditLog = new SqliteAuditLogRepository(context);

  return {
    repositories: { devices, appSettings, syncMetadata, syncQueue, auditLog },
    services: {
      device: new DeviceService({ devices }),
      appSettings: new AppSettingsService({
        appSettings,
        auditLog,
        transactions: context.transactions,
      }),
      syncMetadata: new SyncMetadataService({ syncMetadata }),
      syncQueue: new SyncQueueService({ syncQueue, transactions: context.transactions }),
      auditLog: new AuditLogService({ auditLog }),
    },
  };
}
