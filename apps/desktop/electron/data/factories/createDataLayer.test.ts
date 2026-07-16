import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseManager } from '../../database/DatabaseManager';
import { createDataLayer, type DataLayer } from './createDataLayer';

const TEST_DEVICE = {
  deviceName: 'factory-test',
  platform: 'win32',
  osVersion: '10.0',
  appVersion: '1.0.0',
};

describe('createDataLayer', () => {
  let directory: string;
  let manager: DatabaseManager;
  let dataLayer: DataLayer;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-datalayer-test-'));
    manager = new DatabaseManager({ userDataDir: directory, device: TEST_DEVICE });
    manager.initialize();
    dataLayer = createDataLayer(manager, { info: () => {}, warn: () => {}, error: () => {} });
  });

  afterEach(() => {
    manager.shutdown();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('wires repositories against the real platform database', () => {
    // The platform seed created the device row and the sync_metadata singleton.
    expect(dataLayer.repositories.devices.count()).toBe(1);
    expect(dataLayer.repositories.syncMetadata.get().syncStatus).toBe('never');
  });

  it('end-to-end: settings service round-trip writes setting + audit atomically', async () => {
    await dataLayer.services.appSettings.set('sync.interval', 15);
    await expect(dataLayer.services.appSettings.get('sync.interval')).resolves.toBe(15);
    const audits = dataLayer.repositories.auditLog.findByCategory('application');
    expect(audits.some((entry) => entry.event === 'setting.updated')).toBe(true);
  });

  it('end-to-end: queue service fail() records the linked sync error', async () => {
    const item = await dataLayer.services.syncQueue.enqueue({
      entityType: 'student',
      entityId: 'e1',
      operationType: 'create',
      payload: { name: 'Ada' },
    });
    await dataLayer.services.syncQueue.fail(item.id, { message: 'offline' });
    const errors = dataLayer.repositories.syncQueue.errorsForOperation(item.id);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.retryCount).toBe(1);
  });
});
