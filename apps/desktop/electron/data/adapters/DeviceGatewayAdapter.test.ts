import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TableNames } from '../../database/schema/tableNames';
import { createTestContext, type TestContext } from '../testing/createTestContext';
import { SqliteDeviceRepository } from '../repositories/sqlite/SqliteDeviceRepository';
import { DeviceGatewayAdapter } from './DeviceGatewayAdapter';

describe('DeviceGatewayAdapter.getCurrent', () => {
  let test: TestContext;

  beforeEach(() => {
    test = createTestContext();
  });
  afterEach(() => test.cleanup());

  it('returns null when no device is registered', () => {
    const adapter = new DeviceGatewayAdapter(new SqliteDeviceRepository(test.context));
    expect(adapter.getCurrent()).toBeNull();
  });

  it('returns the registered device', () => {
    const devices = new SqliteDeviceRepository(test.context);
    const adapter = new DeviceGatewayAdapter(devices);
    const registered = adapter.register({
      deviceName: 'lab-01', platform: 'win32', osVersion: '10.0', appVersion: '1.0.0',
    });
    const current = adapter.getCurrent();
    expect(current?.id).toBe(registered.id);
    expect(current?.deviceName).toBe('lab-01');
  });

  it('returns the most recently created device when more than one exists', () => {
    const adapter = new DeviceGatewayAdapter(new SqliteDeviceRepository(test.context));
    // Insert two rows with explicit, distinct createdAt so ordering is deterministic.
    const insert = test.context.connection.prepare(
      `INSERT INTO ${TableNames.devices}
       (id, deviceName, platform, osVersion, appVersion, createdAt, updatedAt)
       VALUES (?, ?, 'win32', '10.0', '1.0.0', ?, ?)`,
    );
    insert.run('dev-old', 'old', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    insert.run('dev-new', 'new', '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z');
    expect(adapter.getCurrent()?.id).toBe('dev-new');
  });
});
