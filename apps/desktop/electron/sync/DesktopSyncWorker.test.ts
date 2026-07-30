import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseManager } from '../database/DatabaseManager';
import { createDataLayer, type DataLayer } from '../data/factories/createDataLayer';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { WorkspaceManager, ActiveWorkspace } from '../workspace/WorkspaceManager';
import type { BackendProvisioningGateway } from '../provisioning/BackendProvisioningGateway';
import { DesktopSyncWorker } from './DesktopSyncWorker';

const TEST_DEVICE = { deviceName: 'worker-test', platform: 'win32', osVersion: '10.0', appVersion: '1.0.0' };
const TEST_USER = {
  id: 'user-1',
  role: 'INSTITUTION_ADMIN',
  scope: { type: 'INSTITUTION', scopeId: 'school-1' },
  institutionId: 'school-1',
} as ActiveWorkspace['user'];

function alwaysOnline() {
  return { isOnline: () => true };
}

describe('DesktopSyncWorker retry policy', () => {
  let directory: string;
  let manager: DatabaseManager;
  let dataLayer: DataLayer;
  let workspaces: WorkspaceManager;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-syncworker-test-'));
    manager = new DatabaseManager({ userDataDir: directory, device: TEST_DEVICE });
    manager.initialize();
    dataLayer = createDataLayer(manager, { info: () => {}, warn: () => {}, error: () => {} });
    manager.connection.prepare(`
      INSERT INTO provisioning_metadata (id,status,institutionId,userId,serverDeviceId,startedAt,updatedAt)
      VALUES ('singleton','complete','school-1','user-1','device-1',?,?)
    `).run('2026-07-29T00:00:00.000Z', '2026-07-29T00:00:00.000Z');
    workspaces = {
      get active(): ActiveWorkspace {
        return {
          identity: 'test-identity',
          user: TEST_USER,
          database: manager,
          data: dataLayer,
          application: {} as ApplicationLayer,
        };
      },
    } as unknown as WorkspaceManager;
  });

  afterEach(() => {
    manager.shutdown();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('schedules a backoff retry (stays pending) below the dead-letter threshold', async () => {
    const item = await dataLayer.services.syncQueue.enqueue({
      entityType: 'students',
      entityId: 's1',
      operationType: 'create',
      payload: { firstName: 'Ada' },
    });
    const gateway = {
      pushChanges: vi.fn().mockRejectedValue(new Error('network down')),
      downloadSnapshot: vi.fn(),
    } as unknown as BackendProvisioningGateway;
    const worker = new DesktopSyncWorker(workspaces, gateway, alwaysOnline());

    await expect(worker.syncActive()).rejects.toThrow('network down');

    const row = manager.connection
      .prepare(`SELECT status, retryCount, nextAttemptAt, deadLetter FROM sync_queue WHERE id=?`)
      .get(item.id) as { status: string; retryCount: number; nextAttemptAt: string | null; deadLetter: number };
    expect(row.status).toBe('pending');
    expect(row.retryCount).toBe(1);
    expect(row.nextAttemptAt).not.toBeNull();
    expect(row.deadLetter).toBe(0);
  });

  it('dead-letters an item after 5 failed attempts instead of retrying forever', async () => {
    const item = await dataLayer.services.syncQueue.enqueue({
      entityType: 'students',
      entityId: 's1',
      operationType: 'create',
      payload: { firstName: 'Ada' },
    });
    const gateway = {
      pushChanges: vi.fn().mockRejectedValue(new Error('server rejected')),
      downloadSnapshot: vi.fn(),
    } as unknown as BackendProvisioningGateway;
    const worker = new DesktopSyncWorker(workspaces, gateway, alwaysOnline());

    for (let attempt = 0; attempt < 5; attempt += 1) {
      manager.connection.prepare(`UPDATE sync_queue SET nextAttemptAt=NULL WHERE id=?`).run(item.id);
      await expect(worker.syncActive()).rejects.toThrow();
    }

    const row = manager.connection
      .prepare(`SELECT status, retryCount, deadLetter FROM sync_queue WHERE id=?`)
      .get(item.id) as { status: string; retryCount: number; deadLetter: number };
    expect(row.retryCount).toBe(5);
    expect(row.deadLetter).toBe(1);
    expect(row.status).toBe('failed');
  });

  it('getStatus reports isOnline from the injected connectivity source', () => {
    const worker = new DesktopSyncWorker(workspaces, {} as BackendProvisioningGateway, { isOnline: () => false });
    expect(worker.getStatus().isOnline).toBe(false);
  });

  it('listConflicts includes dead-lettered queue items alongside real conflicts', async () => {
    const item = await dataLayer.services.syncQueue.enqueue({
      entityType: 'students',
      entityId: 's1',
      operationType: 'create',
      payload: { firstName: 'Ada' },
    });
    for (let i = 0; i < 4; i += 1) {
      await dataLayer.services.syncQueue.scheduleRetry(item.id, '2026-01-01T00:00:00.000Z');
    }
    await dataLayer.services.syncQueue.fail(item.id, { message: 'server rejected permanently' });
    // fail() only sets status='failed' via markFailed(); the deadLetter flag
    // is set exclusively by DesktopSyncWorker.syncActive()'s own dead-letter
    // transition (see the catch block above). Set it explicitly here to
    // simulate an item that already went through that transition, matching
    // how the next test below arranges its dead-lettered fixture.
    manager.connection.prepare(`UPDATE sync_queue SET deadLetter=1 WHERE id=?`).run(item.id);

    const worker = new DesktopSyncWorker(workspaces, {} as BackendProvisioningGateway, alwaysOnline());
    const conflicts = worker.listConflicts();

    const deadLettered = conflicts.find((c) => c.operationId === item.id);
    expect(deadLettered?.source).toBe('dead_letter');
    expect(deadLettered?.reason).toContain('server rejected permanently');
  });

  it('resolveConflict with resolution "retry" revives a dead-lettered item', async () => {
    const item = await dataLayer.services.syncQueue.enqueue({
      entityType: 'students',
      entityId: 's1',
      operationType: 'create',
      payload: { firstName: 'Ada' },
    });
    await dataLayer.services.syncQueue.fail(item.id, { message: 'boom' });
    manager.connection.prepare(`UPDATE sync_queue SET deadLetter=1 WHERE id=?`).run(item.id);

    const worker = new DesktopSyncWorker(workspaces, {} as BackendProvisioningGateway, alwaysOnline());
    const result = worker.resolveConflict({ conflictId: item.id, resolution: 'retry' });

    expect(result.status).toBe('retried');
    const row = manager.connection
      .prepare(`SELECT status, retryCount, deadLetter FROM sync_queue WHERE id=?`)
      .get(item.id) as { status: string; retryCount: number; deadLetter: number };
    expect(row.status).toBe('pending');
    expect(row.retryCount).toBe(0);
    expect(row.deadLetter).toBe(0);
  });
});
