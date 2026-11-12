import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedSession } from '@nemis-desktop/application';
import { DesktopScopeType, SystemRole, type ProvisioningUser } from '@nemis-desktop/types';
import { UnauthorizedError } from '@nemis-desktop/shared';
import { ProvisioningService } from './ProvisioningService';

const device = { id: 'd-1', fingerprint: 'f'.repeat(64), name: 'PC', platform: 'win32', osVersion: '11', appVersion: '1' };
const user: ProvisioningUser = {
  id: 'u-1', email: 'r@school.lr', firstName: 'Reg', lastName: 'Istrar',
  role: SystemRole.INSTITUTION_STAFF,
  scope: { type: DesktopScopeType.INSTITUTION, scopeId: 'inst-1', institutionId: 'inst-1' },
  institutionId: 'inst-1', modules: ['STUDENTS', 'REPORTS'], title: 'Registrar',
};
const sessionFor = (u: ProvisioningUser): AuthenticatedSession =>
  ({ user: u, sessionSecret: 's', offlineAccessExpiresAt: '2099-01-01T00:00:00.000Z' });

function build(initial: ProvisioningUser | null = user, opts: { provisioned?: boolean; gateway?: unknown } = {}) {
  const workspaces = { activate: vi.fn(), close: vi.fn() };
  const emit = vi.fn();
  const restore = vi.fn(async () => (initial ? sessionFor(initial) : null));
  const completion = { userId: user.id, role: user.role, scopeType: user.scope.type, scopeId: user.scope.scopeId, completedAt: '2026-01-01T00:00:00.000Z' };
  const service = new ProvisioningService(
    { execute: vi.fn() } as never,
    { execute: restore } as never,
    { execute: vi.fn(async () => undefined) } as never,
    (opts.gateway ?? {}) as never,
    { getCompletion: () => (opts.provisioned === false ? null : completion), import: vi.fn() } as never,
    device as never,
    workspaces,
    emit,
  );
  return { service, workspaces, emit, restore };
}

describe('applyRestoredSession', () => {
  it('ignores a restore when nobody is signed in', async () => {
    const { service, workspaces, emit } = build(null);
    await service.getStatus();
    service.applyRestoredSession(sessionFor(user));
    expect(workspaces.activate).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
    expect((await service.getStatus()).authentication).toBe('anonymous');
  });

  it('does nothing when the user is unchanged (modules in another order)', async () => {
    const { service, workspaces, emit } = build();
    await service.getStatus();
    workspaces.activate.mockClear();
    service.applyRestoredSession(sessionFor({ ...user, modules: ['REPORTS', 'STUDENTS'] }));
    expect(workspaces.activate).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('activates the fresh user, updates the status and emits refreshed when modules change', async () => {
    const { service, workspaces, emit } = build();
    await service.getStatus();
    const fresh: ProvisioningUser = { ...user, modules: ['STUDENTS', 'REPORTS', 'FINANCE_RULES'] };
    service.applyRestoredSession(sessionFor(fresh));
    expect(workspaces.activate).toHaveBeenLastCalledWith(fresh);
    expect((await service.getStatus()).user).toEqual(fresh);
    expect(emit).toHaveBeenCalledWith({ type: 'session', reason: 'refreshed' });
  });

  it('revokes with reason changed when the workspace identity differs', async () => {
    const { service, workspaces, emit } = build();
    await service.getStatus();
    workspaces.activate.mockClear();
    service.applyRestoredSession(sessionFor({ ...user, role: SystemRole.INSTITUTION_ADMIN }));
    expect(workspaces.activate).not.toHaveBeenCalled();
    expect(workspaces.close).toHaveBeenCalledTimes(1);
    const status = await service.getStatus();
    expect(status.authentication).toBe('expired');
    expect(status.user).toBeNull();
    expect(status.message).toBe('Your role or school assignment changed. Sign in again to open the right workspace.');
    expect(emit).toHaveBeenCalledWith({ type: 'session', reason: 'revoked' });
  });
});

describe('revokeSession', () => {
  it('closes the workspace, marks the status expired with the ended message and emits revoked once', async () => {
    const { service, workspaces, emit } = build();
    await service.getStatus();
    service.revokeSession('ended');
    service.revokeSession('ended');
    expect(workspaces.close).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith({ type: 'session', reason: 'revoked' });
    const status = await service.getStatus();
    expect(status.authentication).toBe('expired');
    expect(status.isProvisioned).toBe(false);
    expect(status.message).toBe('Your session has ended. Sign in again. If this keeps happening, contact your School Admin.');
  });

  it('is a no-op when nobody is signed in', async () => {
    const { service, workspaces, emit } = build(null);
    await service.getStatus();
    service.revokeSession('ended');
    expect(workspaces.close).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('does not restore again on the next getStatus', async () => {
    const { service, restore } = build();
    await service.getStatus();
    service.revokeSession('ended');
    restore.mockClear();
    expect((await service.getStatus()).authentication).toBe('expired');
    expect(restore).not.toHaveBeenCalled();
  });
});

describe('revoked session stays revoked', () => {
  it('ignores a later restored session after revokeSession', async () => {
    const { service, workspaces, emit } = build();
    await service.getStatus();
    service.revokeSession('ended');
    workspaces.activate.mockClear();
    emit.mockClear();
    service.applyRestoredSession(sessionFor({ ...user, modules: ['STUDENTS'] }));
    expect(workspaces.activate).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
    expect((await service.getStatus()).authentication).toBe('expired');
  });
});

describe('start() when revoked mid-provisioning', () => {
  it('keeps the revoke message and rethrows', async () => {
    const ref: { service?: ProvisioningService } = {};
    const gateway = {
      registerDevice: vi.fn(async () => {
        ref.service!.revokeSession('ended');
        throw new UnauthorizedError();
      }),
    };
    const { service } = build(user, { provisioned: false, gateway });
    ref.service = service;
    await service.getStatus();
    await expect(service.start()).rejects.toBeInstanceOf(UnauthorizedError);
    const status = await service.getStatus();
    expect(status.authentication).toBe('expired');
    expect(status.message).toBe('Your session has ended. Sign in again. If this keeps happening, contact your School Admin.');
  });
});
