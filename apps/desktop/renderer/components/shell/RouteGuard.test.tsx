import { render, screen, waitFor } from '@testing-library/react';
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

import { RouteGuard } from './RouteGuard';
import { useSessionUser } from './SessionUserContext';
import { sharedBridge } from '@/services/nemis-bridge/shared';

const status = (role: string) =>
  ({
    isProvisioned: true,
    authentication: 'authenticated',
    user: { id: 'u1', email: 'a@b.c', firstName: 'A', lastName: 'B', role, scope: 'INSTITUTION' },
  }) as never;

function Probe() {
  return <div>role:{useSessionUser().role}</div>;
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
});
