import type { Database as SqliteDatabase } from 'better-sqlite3';
import { DATABASE_VERSION } from '../constants/version';
import { wrapSqliteError } from '../errors/wrapSqliteError';
import { newId } from '../helpers/ids';
import { nowIso } from '../helpers/time';
import { TableNames } from '../schema/tableNames';

export interface DeviceInfo {
  deviceName: string;
  platform: string;
  osVersion: string;
  appVersion: string;
}

export interface MetadataInitResult {
  deviceId: string;
  deviceCreated: boolean;
}

interface DeviceRow {
  id: string;
  deviceName: string;
  osVersion: string;
  appVersion: string;
}

/** Settings created on first run only; user changes are never overwritten. */
const DEFAULT_SETTINGS: Readonly<Record<string, unknown>> = {
  theme: 'system',
  language: 'en',
};

/**
 * Idempotent platform-metadata seed, run on every startup after migrations:
 * ensures this installation's device identity, the sync_metadata singleton
 * (with current schema/database versions), and first-run default settings.
 * Platform infrastructure only — no business data.
 */
export function initializeMetadata(
  db: SqliteDatabase,
  device: DeviceInfo,
  schemaVersion: number,
): MetadataInitResult {
  try {
    return db.transaction((): MetadataInitResult => {
      const now = nowIso();

      const existing = db
        .prepare(`SELECT id, deviceName, osVersion, appVersion FROM ${TableNames.devices} LIMIT 1`)
        .get() as DeviceRow | undefined;

      let deviceId: string;
      let deviceCreated = false;
      if (!existing) {
        deviceId = newId();
        deviceCreated = true;
        db.prepare(
          `INSERT INTO ${TableNames.devices}
           (id, deviceName, platform, osVersion, appVersion, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          deviceId,
          device.deviceName,
          device.platform,
          device.osVersion,
          device.appVersion,
          now,
          now,
        );
      } else {
        deviceId = existing.id;
        const changed =
          existing.deviceName !== device.deviceName ||
          existing.osVersion !== device.osVersion ||
          existing.appVersion !== device.appVersion;
        if (changed) {
          db.prepare(
            `UPDATE ${TableNames.devices}
             SET deviceName = ?, osVersion = ?, appVersion = ?, updatedAt = ?
             WHERE id = ?`,
          ).run(device.deviceName, device.osVersion, device.appVersion, now, deviceId);
        }
      }

      db.prepare(
        `INSERT INTO ${TableNames.syncMetadata}
         (id, lastSyncAt, schemaVersion, databaseVersion, syncStatus, createdAt, updatedAt)
         VALUES ('singleton', NULL, ?, ?, 'never', ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           schemaVersion = excluded.schemaVersion,
           databaseVersion = excluded.databaseVersion,
           updatedAt = excluded.updatedAt`,
      ).run(schemaVersion, DATABASE_VERSION, now, now);

      const insertSetting = db.prepare(
        `INSERT INTO ${TableNames.appSettings} (id, key, value, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (key) DO NOTHING`,
      );
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        insertSetting.run(newId(), key, JSON.stringify(value), now, now);
      }

      return { deviceId, deviceCreated };
    })();
  } catch (error) {
    throw wrapSqliteError(error, 'metadata initialization');
  }
}
