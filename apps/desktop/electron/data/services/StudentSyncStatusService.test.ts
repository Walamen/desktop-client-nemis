import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DesktopScopeType, SystemRole, type ProvisioningUser } from '@nemis-desktop/types';
import { WorkspaceManager } from '@app/workspace/WorkspaceManager';
import { StudentSyncStatusService } from './StudentSyncStatusService';

const admin: ProvisioningUser = {
  id: 'admin-1',
  email: 'admin@example.test',
  firstName: 'School',
  lastName: 'Admin',
  role: SystemRole.INSTITUTION_ADMIN,
  institutionId: 'school-1',
  scope: { type: DesktopScopeType.INSTITUTION, scopeId: 'school-1', institutionId: 'school-1' },
};

const T = '2026-01-01T00:00:00.000Z';

describe('StudentSyncStatusService', () => {
  const directories: string[] = [];
  const opened: WorkspaceManager[] = [];

  afterEach(() => {
    for (const workspaces of opened.splice(0)) workspaces.close();
    for (const directory of directories.splice(0)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  function setup(user = admin) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-student-sync-status-'));
    directories.push(directory);
    const workspaces = new WorkspaceManager({
      userDataDir: directory,
      masterKey: 'ab'.repeat(32),
      device: { deviceName: 'Test', platform: 'win32', osVersion: '11', appVersion: '1' },
      log: { info() {}, warn() {}, error() {} },
    });
    opened.push(workspaces);
    const db = workspaces.activate(user).database.connection;
    return { db, service: new StudentSyncStatusService(workspaces), workspaces };
  }

  type Db = ReturnType<typeof setup>['db'];

  let seq = 0;
  function queueRow(
    db: Db,
    entityId: string,
    operationType: string,
    status: string,
    entityType = 'students',
  ) {
    seq += 1;
    db.prepare(
      `INSERT INTO sync_queue (id, entityType, entityId, operationType, payload, retryCount, status, createdAt, updatedAt, seq)
       VALUES (?, ?, ?, ?, '{}', 0, ?, ?, ?, ?)`,
    ).run(`q-${seq}`, entityType, entityId, operationType, status, T, T, 1000 + seq);
  }

  it('is not synced while the create is pending', () => {
    const { db, service } = setup();
    queueRow(db, 's-1', 'create', 'pending');
    expect(service.isCreateSynced('s-1')).toEqual({ synced: false });
  });

  it('is not synced while the create is in flight or failed', () => {
    const { db, service } = setup();
    queueRow(db, 's-1', 'create', 'in_flight');
    queueRow(db, 's-2', 'create', 'failed');
    expect(service.isCreateSynced('s-1')).toEqual({ synced: false });
    expect(service.isCreateSynced('s-2')).toEqual({ synced: false });
  });

  it('is synced once the create is completed', () => {
    const { db, service } = setup();
    queueRow(db, 's-1', 'create', 'completed');
    expect(service.isCreateSynced('s-1')).toEqual({ synced: true });
  });

  it('ignores a pending update when the create is not pending', () => {
    const { db, service } = setup();
    queueRow(db, 's-1', 'create', 'completed');
    queueRow(db, 's-1', 'update', 'pending');
    expect(service.isCreateSynced('s-1')).toEqual({ synced: true });
    queueRow(db, 's-2', 'update', 'pending');
    expect(service.isCreateSynced('s-2')).toEqual({ synced: true });
  });

  it('is synced when there are no queue rows (a pulled student)', () => {
    const { service } = setup();
    expect(service.isCreateSynced('never-queued')).toEqual({ synced: true });
  });

  it('only looks at the student entity type and the given id', () => {
    const { db, service } = setup();
    queueRow(db, 's-1', 'create', 'pending', 'guardians');
    queueRow(db, 's-9', 'create', 'pending');
    expect(service.isCreateSynced('s-1')).toEqual({ synced: true });
  });

  it('is school-admin only', () => {
    const { service } = setup({ ...admin, role: SystemRole.TEACHER });
    expect(() => service.isCreateSynced('s-1')).toThrow(/school administrator/);
  });
});
