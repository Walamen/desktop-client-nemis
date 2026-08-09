import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import ProvisioningPage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

const DEVICE = { id: 'device-1', fingerprint: 'f'.repeat(64), name: 'PC', platform: 'win32', osVersion: '11', appVersion: '1.0.0' };
const TEACHER_ID = 'user-1';

/**
 * Reproduces the real flow: `RootProviders` runs bootstrap once, immediately,
 * before the user has authenticated — `identity.getCurrentUser` legitimately
 * finds nobody against an inactive workspace (not an error, just empty, per
 * the doc comment in app/providers.tsx). `loggedIn` flips only once the
 * mocked `auth.login` call succeeds, mirroring the main process activating
 * the workspace at that point.
 */
function installMock() {
  let loggedIn = false;
  const authenticatedStatus = {
    authentication: 'authenticated' as const,
    stage: 'ready' as const,
    user: {
      id: TEACHER_ID, email: 'teacher@example.com', firstName: 'Jane', lastName: 'Doe',
      role: 'TEACHER' as const, scope: { type: 'TEACHER' as const, scopeId: TEACHER_ID }, institutionId: 'inst-1',
    },
    device: DEVICE,
    isProvisioned: true,
    completedAt: '2026-01-01T00:00:00.000Z',
    progress: 100,
  };
  const anonymousStatus = {
    authentication: 'anonymous' as const, stage: 'welcome' as const, user: null,
    device: DEVICE, isProvisioned: false, completedAt: null, progress: 0,
  };
  const nemis = {
    auth: {
      getStatus: vi.fn(async () => (loggedIn ? authenticatedStatus : anonymousStatus)),
      login: vi.fn(async () => {
        loggedIn = true;
        return authenticatedStatus;
      }),
    },
    provisioning: { start: vi.fn() },
    identity: {
      getCurrentUser: vi.fn(async () =>
        (loggedIn
          ? { id: TEACHER_ID, fullName: 'Jane Doe', email: 'teacher@example.com', isActive: true, roles: ['TEACHER'] }
          : null)),
    },
    device: { getInfo: vi.fn(async () => null) },
    school: { getSummary: vi.fn(async () => null) },
    academicYear: { getCurrent: vi.fn(async () => null) },
    term: { getCurrent: vi.fn(async () => null) },
    dashboard: { getOverview: vi.fn(async () => null) },
  };
  (window as unknown as { nemis: unknown }).nemis = nemis;
  return nemis;
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

describe('Fresh login without a page reload', () => {
  it('re-populates currentUser after login succeeds, without remounting', async () => {
    const nemis = installMock();
    const layer = createRendererPresentation();

    // The premature pass RootProviders makes at initial mount, before the
    // user has typed anything — workspace inactive, current user legitimately
    // comes back empty.
    await layer.bootstrap.run();
    expect(layer.viewModels.currentUser.store.getState().user.status).not.toBe('success');

    render(
      <PresentationProvider layer={layer}>
        <ProvisioningPage />
      </PresentationProvider>,
    );

    // The form's <label> elements aren't wired via htmlFor/id, so they're not
    // accessible-name-queryable — select the inputs directly by type instead.
    await screen.findByText('Sign in to your school');
    const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement;
    const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: 'teacher@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in and verify/i }));

    await waitFor(() => expect(nemis.auth.login).toHaveBeenCalled());

    // The actual bug: without a re-run, this stays stuck at whatever the
    // premature pass left it at, forever — the teacher dashboard then shows
    // "Loading classes…" forever until a full page reload remounts
    // RootProviders and runs bootstrap a second time, this time correctly.
    await waitFor(() =>
      expect(layer.viewModels.currentUser.store.getState().user).toMatchObject({
        status: 'success',
        data: expect.objectContaining({ id: TEACHER_ID }),
      }),
    );
  });
});
