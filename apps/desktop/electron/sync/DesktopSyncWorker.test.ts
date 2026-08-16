import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseManager } from '../database/DatabaseManager';
import { createDataLayer, type DataLayer } from '../data/factories/createDataLayer';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { WorkspaceManager, ActiveWorkspace } from '../workspace/WorkspaceManager';
import type { BackendProvisioningGateway } from '../provisioning/BackendProvisioningGateway';
import { PROVISIONING_COLLECTIONS } from '@nemis-desktop/types';
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

/**
 * A snapshot with no rows in any collection — the shape of a delta pull that
 * found nothing new. ProvisioningImporter.import() validates the snapshot's
 * scope (including institutionId, which must match
 * ActiveWorkspace.user.institutionId) and its checksum (a real sha256 of
 * `data`, not a placeholder) before any of this suite's assertions are
 * reached, so the fixture must satisfy both — not just
 * PROVISIONING_COLLECTIONS shape. `generatedAt` deliberately differs from any
 * clock the tests set, so an assertion on it can prove the server's timestamp
 * (not the local clock) is what gets persisted as lastDeltaAt.
 */
const SNAPSHOT_GENERATED_AT = '2026-07-28T18:30:45.123Z';

function emptySnapshot() {
  const data = Object.fromEntries(PROVISIONING_COLLECTIONS.map((key) => [key, []]));
  return {
    contractVersion: 1,
    snapshotId: 'snap-1',
    generatedAt: SNAPSHOT_GENERATED_AT,
    userId: 'user-1',
    role: 'INSTITUTION_ADMIN',
    scopeType: 'INSTITUTION',
    scopeId: 'school-1',
    institutionId: 'school-1',
    deviceId: 'device-1',
    checksumAlgorithm: 'sha256',
    checksum: createHash('sha256').update(JSON.stringify(data)).digest('hex'),
    manifest: Object.fromEntries(PROVISIONING_COLLECTIONS.map((key) => [key, 0])),
    data,
  };
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
          workspaceDir: directory,
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

  it('leaves already-pushed items completed when the pull step fails afterwards', async () => {
    const item = await dataLayer.services.syncQueue.enqueue({
      entityType: 'students',
      entityId: 's1',
      operationType: 'create',
      payload: { firstName: 'Ada' },
    });
    const gateway = {
      pushChanges: vi.fn().mockResolvedValue({
        processedAt: '2026-07-29T00:00:00.000Z',
        results: [{ operationId: item.id, entityType: 'students', entityId: 's1', status: 'accepted' }],
      }),
      downloadSnapshot: vi.fn().mockRejectedValue(new Error('pull exploded')),
    } as unknown as BackendProvisioningGateway;
    const worker = new DesktopSyncWorker(workspaces, gateway, alwaysOnline());

    await expect(worker.syncActive()).rejects.toThrow('pull exploded');

    // The push half of this cycle succeeded, so the failure handler must not
    // reschedule or dead-letter its items — they are already synced.
    const row = manager.connection
      .prepare(`SELECT status, retryCount, nextAttemptAt, deadLetter FROM sync_queue WHERE id=?`)
      .get(item.id) as { status: string; retryCount: number; nextAttemptAt: string | null; deadLetter: number };
    expect(row.status).toBe('completed');
    expect(row.retryCount).toBe(0);
    expect(row.nextAttemptAt).toBeNull();
    expect(row.deadLetter).toBe(0);
    expect(
      (manager.connection.prepare(`SELECT COUNT(*) count FROM sync_errors`).get() as { count: number }).count,
    ).toBe(0);
  });

  it('canonicalizes a redirected guardian id locally, cascading the link and any still-queued payload', async () => {
    manager.connection.prepare(`UPDATE sync_runtime SET captureEnabled=0 WHERE id='singleton'`).run();
    manager.connection.prepare(`
      INSERT INTO institutions (id,code,name,type,ownership,countyId,approvalStatus,version,updatedAt)
      VALUES ('school-1','SCH-1','Central High','SECONDARY','PUBLIC','county-1','APPROVED',1,?)
    `).run('2026-07-01T00:00:00.000Z');
    manager.connection.prepare(`
      INSERT INTO students (id,institutionId,firstName,lastName,admissionNumber,dateOfBirth,gender,isActive,version,updatedAt)
      VALUES ('s1','school-1','Ada','Learner','ADM-1','2012-05-04','FEMALE',1,1,?)
    `).run('2026-07-01T00:00:00.000Z');
    manager.connection.prepare(`
      INSERT INTO guardians (id,firstName,lastName,relationship,phoneNumber,email,version,updatedAt)
      VALUES ('g-local','Grace','Hopper','Mother','0770000000','grace@example.com',1,?)
    `).run('2026-07-01T00:00:00.000Z');
    manager.connection.prepare(`
      INSERT INTO student_guardians (id,studentId,guardianId,isPrimary,createdAt)
      VALUES ('sg-1','s1','g-local',1,?)
    `).run('2026-07-01T00:00:00.000Z');
    // A second, not-yet-pushed link for a later sibling reusing the same
    // local guardian id — backed off to a future retry, so claim() will not
    // pick it up in this cycle (simulates a push split across cycles).
    const future = new Date(Date.now() + 60 * 60_000).toISOString();
    manager.connection.prepare(`
      INSERT INTO sync_queue (id,entityType,entityId,operationType,payload,retryCount,status,nextAttemptAt,createdAt,updatedAt)
      VALUES ('op-link-2','student_guardians','sg-2','create',?,0,'pending',?,?,?)
    `).run(
      JSON.stringify({ record: { id: 'sg-2', studentId: 's2', guardianId: 'g-local', isPrimary: 0, createdAt: '2026-08-01T00:00:00.000Z' } }),
      future,
      '2026-08-01T00:00:00.000Z',
      '2026-08-01T00:00:00.000Z',
    );

    const item = await dataLayer.services.syncQueue.enqueue({
      entityType: 'guardians',
      entityId: 'g-local',
      operationType: 'create',
      payload: { record: { id: 'g-local', email: 'grace@example.com' } },
    });
    const gateway = {
      pushChanges: vi.fn().mockResolvedValue({
        processedAt: '2026-08-16T00:00:00.000Z',
        results: [
          {
            operationId: item.id,
            entityType: 'guardians',
            entityId: 'g-local',
            status: 'accepted',
            redirectedTo: 'g-canonical',
          },
        ],
      }),
      downloadSnapshot: vi.fn(),
    } as unknown as BackendProvisioningGateway;
    const worker = new DesktopSyncWorker(workspaces, gateway, alwaysOnline());

    await worker.syncActive();

    expect(
      manager.connection.prepare(`SELECT id FROM guardians WHERE id = 'g-canonical'`).get(),
    ).toBeDefined();
    expect(
      manager.connection.prepare(`SELECT id FROM guardians WHERE id = 'g-local'`).get(),
    ).toBeUndefined();

    const linkRow = manager.connection
      .prepare(`SELECT guardianId FROM student_guardians WHERE id = 'sg-1'`)
      .get() as { guardianId: string };
    expect(linkRow.guardianId).toBe('g-canonical');

    const queuedPayload = manager.connection
      .prepare(`SELECT payload FROM sync_queue WHERE id = 'op-link-2'`)
      .get() as { payload: string };
    expect(JSON.parse(queuedPayload.payload).record.guardianId).toBe('g-canonical');
  });

  it('does not touch the network or the queue while offline', async () => {
    const item = await dataLayer.services.syncQueue.enqueue({
      entityType: 'students',
      entityId: 's1',
      operationType: 'create',
      payload: { firstName: 'Ada' },
    });
    const gateway = {
      pushChanges: vi.fn(),
      downloadSnapshot: vi.fn(),
    } as unknown as BackendProvisioningGateway;
    const worker = new DesktopSyncWorker(workspaces, gateway, { isOnline: () => false });

    await worker.syncActive();

    expect(gateway.pushChanges).not.toHaveBeenCalled();
    expect(gateway.downloadSnapshot).not.toHaveBeenCalled();
    const row = manager.connection
      .prepare(`SELECT status, retryCount FROM sync_queue WHERE id=?`)
      .get(item.id) as { status: string; retryCount: number };
    expect(row.status).toBe('pending');
    expect(row.retryCount).toBe(0);
  });

  it('does not spend retry budget when the server is unreachable', async () => {
    const item = await dataLayer.services.syncQueue.enqueue({
      entityType: 'students',
      entityId: 's1',
      operationType: 'create',
      payload: { firstName: 'Ada' },
    });
    const gateway = {
      // The exact message BackendProvisioningGateway throws for network-level
      // failures, as distinct from a server-side rejection.
      pushChanges: vi.fn().mockRejectedValue(new Error('The NEMIS server could not be reached.')),
      downloadSnapshot: vi.fn(),
    } as unknown as BackendProvisioningGateway;
    const worker = new DesktopSyncWorker(workspaces, gateway, alwaysOnline());

    await expect(worker.syncActive()).rejects.toThrow('could not be reached');

    const row = manager.connection
      .prepare(`SELECT status, retryCount, nextAttemptAt, deadLetter FROM sync_queue WHERE id=?`)
      .get(item.id) as { status: string; retryCount: number; nextAttemptAt: string | null; deadLetter: number };
    expect(row.status).toBe('pending');
    expect(row.nextAttemptAt).toBeNull();
    expect(row.retryCount).toBe(0);
    expect(row.deadLetter).toBe(0);
    expect(
      (manager.connection.prepare(`SELECT COUNT(*) count FROM sync_errors`).get() as { count: number }).count,
    ).toBe(0);
  });

  it('releaseBackoff clears scheduled backoff so a reconnect can claim everything pending', async () => {
    const item = await dataLayer.services.syncQueue.enqueue({
      entityType: 'students',
      entityId: 's1',
      operationType: 'create',
      payload: { firstName: 'Ada' },
    });
    await dataLayer.services.syncQueue.scheduleRetry(item.id, '2099-01-01T00:00:00.000Z');
    const worker = new DesktopSyncWorker(workspaces, {} as BackendProvisioningGateway, alwaysOnline());

    worker.releaseBackoff();

    const row = manager.connection
      .prepare(`SELECT status, nextAttemptAt FROM sync_queue WHERE id=?`)
      .get(item.id) as { status: string; nextAttemptAt: string | null };
    expect(row.status).toBe('pending');
    expect(row.nextAttemptAt).toBeNull();
  });

  it('recoverStaleInFlight returns items stranded in_flight by a dead process to pending', async () => {
    const item = await dataLayer.services.syncQueue.enqueue({
      entityType: 'students',
      entityId: 's1',
      operationType: 'create',
      payload: { firstName: 'Ada' },
    });
    // A crash (or the shutdown-flush race) leaves rows mid-flight; claimBatch
    // only ever selects 'pending', so nothing would ever pick them up again —
    // and while they sit there they also block every delta pull.
    manager.connection.prepare(`UPDATE sync_queue SET status='in_flight' WHERE id=?`).run(item.id);
    const worker = new DesktopSyncWorker(workspaces, {} as BackendProvisioningGateway, alwaysOnline());

    worker.recoverStaleInFlight();

    const row = manager.connection
      .prepare(`SELECT status, retryCount FROM sync_queue WHERE id=?`)
      .get(item.id) as { status: string; retryCount: number };
    expect(row.status).toBe('pending');
    expect(row.retryCount).toBe(0);
  });

  it('syncActive itself recovers a stranded in_flight row and pushes it in the same cycle', async () => {
    const item = await dataLayer.services.syncQueue.enqueue({
      entityType: 'students',
      entityId: 's1',
      operationType: 'create',
      payload: { firstName: 'Ada' },
    });
    // Stranded by a crash mid-push: claim() only ever selects 'pending'.
    // Recovery must happen inside syncActive() — calling it once at boot (the
    // original wiring) is a no-op, because no workspace is unlocked that early,
    // so this row would block itself, every future delta pull, and every
    // subsequent import, forever.
    manager.connection.prepare(`UPDATE sync_queue SET status='in_flight' WHERE id=?`).run(item.id);
    const gateway = {
      pushChanges: vi.fn().mockResolvedValue({
        processedAt: '2026-07-29T00:00:00.000Z',
        results: [{ operationId: item.id, entityType: 'students', entityId: 's1', status: 'accepted' }],
      }),
      downloadSnapshot: vi.fn().mockResolvedValue(emptySnapshot()),
    } as unknown as BackendProvisioningGateway;
    const worker = new DesktopSyncWorker(workspaces, gateway, alwaysOnline());

    await worker.syncActive();

    // Proves the row was recovered AND claimed by this very cycle, not merely
    // returned to 'pending' for some later one.
    expect(gateway.pushChanges).toHaveBeenCalledWith('device-1', [
      expect.objectContaining({ operationId: item.id }),
    ]);
    // ...and that the pull it used to block now runs: the pull gate counts
    // in_flight as still-pending, so an unrecovered row would have skipped this.
    expect(gateway.downloadSnapshot).toHaveBeenCalled();
    // That pull's import sweeps status='completed' rows out of the queue, so a
    // fully-processed item is simply gone rather than sitting at 'completed'.
    // The invariant that matters is that nothing is left stranded.
    expect(
      manager.connection.prepare(`SELECT status FROM sync_queue WHERE id=?`).get(item.id),
    ).toBeUndefined();
    expect(
      (manager.connection.prepare(
        `SELECT COUNT(*) count FROM sync_queue WHERE status IN ('pending','in_flight')`,
      ).get() as { count: number }).count,
    ).toBe(0);
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

  it('a delta pull merges the snapshot instead of wiping local rows it omits', async () => {
    // Seed local rows that a delta snapshot legitimately does not mention.
    // Capture has to be off first: the sync triggers would otherwise enqueue
    // these seed writes, and a non-empty queue skips the pull altogether.
    manager.connection.prepare(`UPDATE sync_runtime SET captureEnabled=0 WHERE id='singleton'`).run();
    manager.connection.prepare(`
      INSERT INTO institutions (id,code,name,type,ownership,countyId,approvalStatus,version,updatedAt)
      VALUES ('school-1','SCH-1','Central High','SECONDARY','PUBLIC','county-1','APPROVED',1,?)
    `).run('2026-07-01T00:00:00.000Z');
    manager.connection.prepare(`
      INSERT INTO students
        (id,institutionId,firstName,lastName,admissionNumber,dateOfBirth,gender,isActive,version,updatedAt)
      VALUES ('s1','school-1','Ada','Learner','ADM-1','2012-05-04','FEMALE',1,1,?)
    `).run('2026-07-01T00:00:00.000Z');
    manager.connection.prepare(`DELETE FROM sync_queue`).run();
    // A full resync already happened moments ago, so this cycle pulls a delta.
    const recently = new Date().toISOString();
    manager.connection.prepare(`
      UPDATE sync_metadata SET lastDeltaAt=?, lastFullResyncAt=? WHERE id='singleton'
    `).run(recently, recently);
    const downloadSnapshot = vi.fn().mockResolvedValue(emptySnapshot());
    const gateway = { pushChanges: vi.fn(), downloadSnapshot } as unknown as BackendProvisioningGateway;
    const worker = new DesktopSyncWorker(workspaces, gateway, alwaysOnline());

    await worker.syncActive();

    expect(downloadSnapshot).toHaveBeenCalledWith('device-1', recently);
    expect(
      (manager.connection.prepare(`SELECT COUNT(*) count FROM students`).get() as { count: number }).count,
    ).toBe(1);
    expect(
      (manager.connection.prepare(`SELECT COUNT(*) count FROM institutions`).get() as { count: number }).count,
    ).toBe(1);
  });

  it('pulls with since after the first sync, and omits since once 24h have passed since the last full resync', async () => {
    const downloadSnapshot = vi.fn().mockResolvedValue(emptySnapshot());
    const gateway = { pushChanges: vi.fn(), downloadSnapshot } as unknown as BackendProvisioningGateway;
    const worker = new DesktopSyncWorker(workspaces, gateway, alwaysOnline());

    // The whole test runs under fake timers (rather than starting the first
    // call on the real wall clock) because DesktopSyncWorker's #lastPullAt
    // gate compares Date.now() against the previous call's Date.now(): if the
    // first call used the real clock and a later fake-timer jump landed
    // earlier than that real timestamp (as happens whenever this suite runs
    // on/after the fixture's 2026-07-29 dates), the diff goes negative and
    // the second pull is silently skipped, breaking this assertion for
    // reasons unrelated to the since/delta logic under test.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T00:00:00.000Z'));

    await worker.syncActive(); // first pull: no lastDeltaAt yet -> full (no since)
    expect(downloadSnapshot).toHaveBeenLastCalledWith('device-1', undefined);
    // lastDeltaAt is the cutoff the NEXT pull's `since` is measured against, so
    // it has to be the server's own generatedAt — this device's clock would
    // silently skip anything the server wrote during the download/import
    // window, or anything at all under clock skew. lastFullResyncAt is purely
    // local scheduling bookkeeping and stays on the local clock.
    expect(readSyncMetadata()).toEqual({
      lastDeltaAt: SNAPSHOT_GENERATED_AT,
      lastFullResyncAt: '2026-07-29T00:00:00.000Z',
    });

    manager.connection.prepare(`
      UPDATE sync_metadata SET lastDeltaAt=?, lastFullResyncAt=? WHERE id='singleton'
    `).run('2026-07-29T00:00:00.000Z', '2026-07-29T00:00:00.000Z');

    vi.setSystemTime(new Date('2026-07-29T01:00:00.000Z')); // +1h: well within 24h
    await worker.syncActive();
    expect(downloadSnapshot).toHaveBeenLastCalledWith('device-1', '2026-07-29T00:00:00.000Z');
    expect(readSyncMetadata()).toEqual({
      lastDeltaAt: SNAPSHOT_GENERATED_AT,
      lastFullResyncAt: '2026-07-29T00:00:00.000Z', // untouched by a delta pull
    });

    vi.setSystemTime(new Date('2026-07-30T01:00:00.000Z')); // +25h from lastFullResyncAt
    await worker.syncActive();
    expect(downloadSnapshot).toHaveBeenLastCalledWith('device-1', undefined);
    vi.useRealTimers();
  });

  function readSyncMetadata(): { lastDeltaAt: string | null; lastFullResyncAt: string | null } {
    return manager.connection
      .prepare(`SELECT lastDeltaAt, lastFullResyncAt FROM sync_metadata WHERE id='singleton'`)
      .get() as { lastDeltaAt: string | null; lastFullResyncAt: string | null };
  }
});
