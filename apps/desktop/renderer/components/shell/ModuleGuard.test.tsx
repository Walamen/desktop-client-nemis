import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemRole, type ProvisioningUser } from '@nemis-desktop/types';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/government/school-admin'),
  useRouter: () => ({ replace }),
}));

import { usePathname } from 'next/navigation';
import { ModuleGuard } from './ModuleGuard';
import { SessionUserProvider } from './SessionUserContext';

const BASE = '/government/school-admin';
const user = (role: ProvisioningUser['role'], modules?: ProvisioningUser['modules']) =>
  ({ id: 'u1', email: 'a@b.c', firstName: 'A', lastName: 'B', role, scope: 'INSTITUTION', modules }) as unknown as ProvisioningUser;

function renderAt(path: string, u: ProvisioningUser) {
  vi.mocked(usePathname).mockReturnValue(`${BASE}${path}`);
  return render(
    <SessionUserProvider user={u}>
      <ModuleGuard><div>page</div></ModuleGuard>
    </SessionUserProvider>,
  );
}

beforeEach(() => replace.mockReset());

describe('ModuleGuard', () => {
  it('registrar on /students renders the page', () => {
    renderAt('/students', user(SystemRole.INSTITUTION_STAFF, ['STUDENTS']));
    expect(screen.getByText('page')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('registrar on /financial is redirected to the dashboard', async () => {
    renderAt('/financial', user(SystemRole.INSTITUTION_STAFF, ['STUDENTS']));
    expect(screen.queryByText('page')).toBeNull();
    await waitFor(() => expect(replace).toHaveBeenCalledWith(BASE));
  });

  it.each(['/academic-years/close', '/settings/users'])(
    'office staff on %s is redirected',
    async (path) => {
      renderAt(path, user(SystemRole.INSTITUTION_STAFF, ['STUDENTS', 'FINANCE_RULES']));
      expect(screen.queryByText('page')).toBeNull();
      await waitFor(() => expect(replace).toHaveBeenCalledWith(BASE));
    },
  );

  it('admin passes every route', () => {
    for (const p of ['/financial', '/academic-years/close', '/settings/users']) {
      const { unmount } = renderAt(p, user(SystemRole.INSTITUTION_ADMIN));
      expect(screen.getByText('page')).toBeTruthy();
      unmount();
    }
    expect(replace).not.toHaveBeenCalled();
  });

  it('staff with modules undefined on /students is redirected; on /messages renders', async () => {
    const { unmount } = renderAt('/students', user(SystemRole.INSTITUTION_STAFF));
    expect(screen.queryByText('page')).toBeNull();
    await waitFor(() => expect(replace).toHaveBeenCalledWith(BASE));
    unmount();
    renderAt('/messages', user(SystemRole.INSTITUTION_STAFF));
    expect(screen.getByText('page')).toBeTruthy();
  });
});
