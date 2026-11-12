import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemRole } from '@nemis-desktop/types';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/government/school-admin'),
  useRouter: () => ({ replace }),
}));
vi.mock('@/services/nemis-bridge/shared', () => ({
  sharedBridge: { getProvisioningStatus: vi.fn() },
}));
vi.mock('@/hooks/use-realtime', () => ({ useRealtime: vi.fn() }));

import { RouteGuard } from './RouteGuard';
import { useSessionUser } from './SessionUserContext';
import { sharedBridge } from '@/services/nemis-bridge/shared';
import { useRealtime } from '@/hooks/use-realtime';

const status = (role: string) =>
  ({
    isProvisioned: true,
    authentication: 'authenticated',
    user: { id: 'u1', email: 'a@b.c', firstName: 'A', lastName: 'B', role, scope: 'INSTITUTION' },
  }) as never;

function Probe() {
  return <div>role:{useSessionUser().role}</div>;
}

const fire = (event: unknown) =>
  act(() => {
    vi.mocked(useRealtime).mock.calls.at(-1)![0](event as never);
  });

// `status()` is typed `never`; build staff statuses with modules separately.
const staffStatus = (modules: string[]) =>
  ({
    isProvisioned: true,
    authentication: 'authenticated',
    user: {
      id: 'u1',
      email: 'a@b.c',
      firstName: 'A',
      lastName: 'B',
      role: SystemRole.INSTITUTION_STAFF,
      scope: 'INSTITUTION',
      modules,
    },
  }) as never;

function ModulesProbe() {
  return <div>modules:{(useSessionUser().modules ?? []).join(',')}</div>;
}

beforeEach(() => {
  replace.mockReset();
  window.history.pushState({}, '', '/government/school-admin');
});

describe('RouteGuard', () => {
  it('admits INSTITUTION_STAFF when listed in requiredRoles and provides the session user', async () => {
    vi.mocked(sharedBridge.getProvisioningStatus).mockResolvedValue(status(SystemRole.INSTITUTION_STAFF));
    render(
      <RouteGuard requiredRoles={[SystemRole.INSTITUTION_ADMIN, SystemRole.INSTITUTION_STAFF]}>
        <Probe />
      </RouteGuard>,
    );
    expect(await screen.findByText(`role:${SystemRole.INSTITUTION_STAFF}`)).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('sends a TEACHER to /government/teacher', async () => {
    vi.mocked(sharedBridge.getProvisioningStatus).mockResolvedValue(status(SystemRole.TEACHER));
    render(
      <RouteGuard requiredRoles={[SystemRole.INSTITUTION_ADMIN, SystemRole.INSTITUTION_STAFF]}>
        <Probe />
      </RouteGuard>,
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/government/teacher'));
    expect(screen.queryByText(/role:/)).toBeNull();
  });

  it('re-reads the provisioning status and provides the new user on session/refreshed', async () => {
    vi.mocked(sharedBridge.getProvisioningStatus).mockResolvedValue(staffStatus(['STUDENTS']));
    render(
      <RouteGuard requiredRoles={[SystemRole.INSTITUTION_STAFF]}>
        <ModulesProbe />
      </RouteGuard>,
    );
    expect(await screen.findByText('modules:STUDENTS')).toBeTruthy();
    vi.mocked(sharedBridge.getProvisioningStatus).mockResolvedValue(staffStatus(['STUDENTS', 'REPORTS']));
    fire({ type: 'session', reason: 'refreshed' });
    expect(await screen.findByText('modules:STUDENTS,REPORTS')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('sends the user to the sign-in page on session/revoked', async () => {
    vi.mocked(sharedBridge.getProvisioningStatus).mockResolvedValue(status(SystemRole.INSTITUTION_STAFF));
    render(
      <RouteGuard requiredRoles={[SystemRole.INSTITUTION_STAFF]}>
        <Probe />
      </RouteGuard>,
    );
    await screen.findByText(`role:${SystemRole.INSTITUTION_STAFF}`);
    fire({ type: 'session', reason: 'revoked' });
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
  });

  it('ignores other realtime events', async () => {
    vi.mocked(sharedBridge.getProvisioningStatus).mockResolvedValue(status(SystemRole.INSTITUTION_STAFF));
    render(
      <RouteGuard requiredRoles={[SystemRole.INSTITUTION_STAFF]}>
        <Probe />
      </RouteGuard>,
    );
    await screen.findByText(`role:${SystemRole.INSTITUTION_STAFF}`);
    vi.mocked(sharedBridge.getProvisioningStatus).mockClear();
    fire({ type: 'notification' });
    expect(sharedBridge.getProvisioningStatus).not.toHaveBeenCalled();
  });
});
