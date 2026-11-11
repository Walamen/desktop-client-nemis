import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DesktopScopeType, SystemRole, type ProvisioningUser } from '@nemis-desktop/types';
import { deriveWorkspaceKey, WorkspaceManager, workspaceIdentity } from './WorkspaceManager';

const base: ProvisioningUser = {
  id: 'user-1',
  email: 'one@example.test',
  firstName: 'One',
  lastName: 'User',
  role: SystemRole.INSTITUTION_ADMIN,
  scope: {
    type: DesktopScopeType.INSTITUTION,
    scopeId: 'school-1',
    institutionId: 'school-1',
  },
  institutionId: 'school-1',
};

describe('workspace cryptographic isolation', () => {
  it('separates users, roles and scopes', () => {
    const identity = workspaceIdentity(base);
    expect(workspaceIdentity({ ...base, id: 'user-2' })).not.toBe(identity);
    expect(workspaceIdentity({
      ...base,
      role: SystemRole.TEACHER,
      scope: { ...base.scope, type: DesktopScopeType.TEACHER, scopeId: 'user-1' },
    })).not.toBe(identity);
    expect(workspaceIdentity({
      ...base,
      scope: { ...base.scope, scopeId: 'school-2', institutionId: 'school-2' },
    })).not.toBe(identity);
  });

  it('derives a distinct stable SQLCipher key for each workspace', () => {
    const master = 'ab'.repeat(32);
    const one = deriveWorkspaceKey(master, workspaceIdentity(base));
    const two = deriveWorkspaceKey(master, workspaceIdentity({ ...base, id: 'user-2' }));
    expect(one).toMatch(/^[a-f0-9]{64}$/);
    expect(one).not.toBe(master);
    expect(two).not.toBe(one);
    expect(deriveWorkspaceKey(master, workspaceIdentity(base))).toBe(one);
  });
});

describe('WorkspaceManager.activate', () => {
  it('refreshes the user when the same identity is activated again', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-workspace-manager-'));
    const workspaces = new WorkspaceManager({
      userDataDir: directory,
      masterKey: 'ab'.repeat(32),
      device: { deviceName: 'Test', platform: 'win32', osVersion: '11', appVersion: '1' },
      log: { info() {}, warn() {}, error() {} },
    });
    try {
      const office: ProvisioningUser = {
        ...base,
        role: SystemRole.INSTITUTION_STAFF,
        modules: ['STUDENTS'],
      };
      const first = workspaces.activate(office);
      const second = workspaces.activate({ ...office, modules: ['STUDENTS', 'REPORTS'] });
      expect(workspaces.active.user.modules).toEqual(['STUDENTS', 'REPORTS']);
      expect(second.database).toBe(first.database);
    } finally {
      workspaces.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
