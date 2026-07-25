import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DesktopScopeType, SystemRole, type ProvisioningUser } from '@nemis-desktop/types';
import { WorkspaceManager } from '@app/workspace/WorkspaceManager';
import { SchoolAdminModuleService } from './SchoolAdminModuleService';

const admin: ProvisioningUser = {
  id: 'admin-1',
  email: 'admin@example.test',
  firstName: 'School',
  lastName: 'Admin',
  role: SystemRole.INSTITUTION_ADMIN,
  institutionId: 'school-1',
  scope: {
    type: DesktopScopeType.INSTITUTION,
    scopeId: 'school-1',
    institutionId: 'school-1',
  },
};

describe('SchoolAdminModuleService', () => {
  const directories: string[] = [];

  afterEach(() => {
    for (const directory of directories.splice(0)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  function setup(user = admin) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-school-admin-service-'));
    directories.push(directory);
    const workspaces = new WorkspaceManager({
      userDataDir: directory,
      masterKey: 'ab'.repeat(32),
      device: { deviceName: 'Test', platform: 'win32', osVersion: '11', appVersion: '1' },
      log: { info() {}, warn() {}, error() {} },
    });
    const workspace = workspaces.activate(user);
    workspace.database.connection
      .prepare(
        `
      INSERT INTO institutions
        (id,code,name,type,ownership,countyId,approvalStatus,version,updatedAt)
      VALUES ('school-1','ONE','One','SECONDARY','PUBLIC','county-1','APPROVED',1,?)
    `,
      )
      .run(new Date().toISOString());
    return { workspaces, service: new SchoolAdminModuleService(workspaces) };
  }

  it('forces institution-owned records into the active scope and captures them for sync', () => {
    const { workspaces, service } = setup();
    const saved = service.save({
      collection: 'announcements',
      record: {
        institutionId: 'school-2',
        title: 'Offline notice',
        content: 'Classes resume Monday',
        author: 'admin-1',
        priority: 'HIGH',
      },
    });

    expect(saved.institutionId).toBe('school-1');
    const queued = workspaces.active.database.connection
      .prepare(
        `
      SELECT entityType,entityId FROM sync_queue WHERE entityType='announcements'
    `,
      )
      .get() as { entityType: string; entityId: string };
    expect(queued).toEqual({ entityType: 'announcements', entityId: saved.id });
    workspaces.close();
  });

  it('rejects the school-admin module from another role workspace', () => {
    const { workspaces, service } = setup({
      ...admin,
      id: 'teacher-1',
      role: SystemRole.TEACHER,
      scope: { ...admin.scope, type: DesktopScopeType.TEACHER, scopeId: 'teacher-1' },
    });
    expect(() => service.list({ collection: 'fee_rules' })).toThrow(/not available/);
    workspaces.close();
  });

  it('does not permit offline payment edits', () => {
    const { workspaces, service } = setup();
    workspaces.active.database.connection
      .prepare(
        `
      INSERT INTO fee_payments
        (id,obligationId,studentId,institutionId,amount,method,receiptNumber,recordedBy,
         isReversed,paidAt,createdAt,updatedAt)
      VALUES ('payment-1','obligation-1','student-1','school-1',10,'CASH','R-1',
              'admin-1',0,?,?,?)
    `,
      )
      .run(new Date().toISOString(), new Date().toISOString(), new Date().toISOString());
    expect(() =>
      service.save({
        collection: 'fee_payments',
        record: { id: 'payment-1', amount: 999 },
      }),
    ).toThrow(/append-only/);
    workspaces.close();
  });

  it('records a payment and updates the local obligation without queuing a derived obligation edit', () => {
    const { workspaces, service } = setup();
    const now = new Date().toISOString();
    workspaces.active.database.connection
      .prepare(
        `
      INSERT INTO fee_obligations
        (id,studentId,feeRuleId,institutionId,academicYearId,termId,requiredAmount,
         totalPaid,status,createdBy,createdAt,updatedAt)
      VALUES ('obligation-1','student-1','rule-1','school-1','year-1','term-1',
              100,20,'PARTIALLY_PAID','admin-1',?,?)
    `,
      )
      .run(now, now);
    workspaces.active.database.connection.prepare('DELETE FROM sync_queue').run();

    service.save({
      collection: 'fee_payments',
      record: {
        obligationId: 'obligation-1',
        studentId: 'tampered-student',
        amount: 80,
        method: 'CASH',
        receiptNumber: 'OFF-1',
        recordedBy: 'tampered-user',
        isReversed: true,
        paidAt: now,
      },
    });

    const obligation = workspaces.active.database.connection
      .prepare(
        `
      SELECT totalPaid,status FROM fee_obligations WHERE id='obligation-1'
    `,
      )
      .get() as { totalPaid: number; status: string };
    expect(obligation).toEqual({ totalPaid: 100, status: 'PAID_IN_FULL' });
    const queued = workspaces.active.database.connection
      .prepare(
        `
      SELECT entityType,COUNT(*) count FROM sync_queue GROUP BY entityType
    `,
      )
      .all() as Array<{ entityType: string; count: number }>;
    expect(queued).toEqual([{ entityType: 'fee_payments', count: 1 }]);
    workspaces.close();
  });

  it('allows a DEO to resolve an alert only when its institution exists in the scoped snapshot', () => {
    const { workspaces, service } = setup({
      ...admin,
      id: 'deo-1',
      role: SystemRole.DEO,
      institutionId: undefined,
      scope: {
        type: DesktopScopeType.DISTRICT,
        scopeId: 'district-1',
        districtId: 'district-1',
      },
    });
    const now = new Date().toISOString();
    workspaces.active.database.connection
      .prepare(
        `
      INSERT INTO alerts
        (id,institutionId,type,severity,title,description,isResolved,createdAt,updatedAt)
      VALUES ('alert-1','school-1','ENROLLMENT_ANOMALY','HIGH','Review','Review data',0,?,?)
    `,
      )
      .run(now, now);
    workspaces.active.database.connection.prepare('DELETE FROM sync_queue').run();

    const saved = service.save({
      collection: 'alerts',
      record: { id: 'alert-1', isResolved: true },
    });
    expect(saved).toMatchObject({ isResolved: 1, resolvedBy: 'deo-1' });
    expect(
      workspaces.active.database.connection
        .prepare(
          `
        SELECT entityType,operationType FROM sync_queue
      `,
        )
        .get(),
    ).toEqual({ entityType: 'alerts', operationType: 'update' });
    workspaces.close();
  });
});
