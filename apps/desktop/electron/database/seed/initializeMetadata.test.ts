import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseError } from '../errors/errors';
import { MigrationService } from '../services/MigrationService';
import { migrations } from '../migrations/registry';
import { TableNames } from '../schema/tableNames';
import { createTestDatabase, type TestDatabase } from '../testing/createTestDatabase';
import { initializeMetadata, type DeviceInfo } from './initializeMetadata';

const device: DeviceInfo = {
  deviceName: 'school-laptop-01',
  platform: 'win32',
  osVersion: '10.0.19045',
  appVersion: '1.0.0',
};

describe('initializeMetadata', () => {
  let test: TestDatabase;

  beforeEach(() => {
    test = createTestDatabase();
    new MigrationService(test.db.raw, migrations).migrateToLatest();
  });

  afterEach(() => {
    test.cleanup();
  });

  it('creates the device row, singleton metadata, and default settings', () => {
    const result = initializeMetadata(test.db.raw, device, 1);
    expect(result.deviceCreated).toBe(true);
    expect(result.deviceId).toMatch(/^[0-9a-f-]{36}$/);

    const meta = test.db.raw
      .prepare(`SELECT * FROM ${TableNames.syncMetadata} WHERE id = 'singleton'`)
      .get()! as { schemaVersion: number; databaseVersion: number; syncStatus: string };
    expect(meta.schemaVersion).toBe(1);
    expect(meta.databaseVersion).toBe(1);
    expect(meta.syncStatus).toBe('never');

    const settings = test.db.raw
      .prepare(`SELECT key, value FROM ${TableNames.appSettings} ORDER BY key`)
      .all() as Array<{ key: string; value: string }>;
    expect(settings.map((s) => s.key)).toEqual(['language', 'theme']);
    expect(JSON.parse(settings[1]!.value)).toBe('system');
  });

  it('is idempotent: keeps the same device id and does not duplicate rows', () => {
    const first = initializeMetadata(test.db.raw, device, 1);
    const second = initializeMetadata(test.db.raw, device, 1);
    expect(second.deviceCreated).toBe(false);
    expect(second.deviceId).toBe(first.deviceId);
    const devices = test.db.raw
      .prepare(`SELECT COUNT(*) AS n FROM ${TableNames.devices}`)
      .get() as { n: number };
    expect(devices.n).toBe(1);
  });

  it('updates osVersion/appVersion on the existing device when they change', () => {
    const { deviceId } = initializeMetadata(test.db.raw, device, 1);
    initializeMetadata(test.db.raw, { ...device, appVersion: '1.1.0' }, 1);
    const row = test.db.raw
      .prepare(`SELECT appVersion FROM ${TableNames.devices} WHERE id = ?`)
      .get(deviceId) as { appVersion: string };
    expect(row.appVersion).toBe('1.1.0');
  });

  it('does not overwrite user-modified settings', () => {
    initializeMetadata(test.db.raw, device, 1);
    test.db.raw
      .prepare(`UPDATE ${TableNames.appSettings} SET value = ? WHERE key = 'theme'`)
      .run(JSON.stringify('dark'));
    initializeMetadata(test.db.raw, device, 1);
    const theme = test.db.raw
      .prepare(`SELECT value FROM ${TableNames.appSettings} WHERE key = 'theme'`)
      .get() as { value: string };
    expect(JSON.parse(theme.value)).toBe('dark');
  });

  it('wraps raw driver failures in the DatabaseError taxonomy', () => {
    const raw = test.db.raw;
    test.db.close();
    expect(() => initializeMetadata(raw, device, 1)).toThrow(DatabaseError);
  });
});
