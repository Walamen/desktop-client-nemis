import { vi } from 'vitest';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { SchoolOfficeUser, SchoolUsersResult } from '@nemis-desktop/types';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { clearNemis, stubNemis } from '@/components/academic-grading/setup-test-support';
import { ToastHost } from '@/components/shell/ToastHost';

/** Shared fixtures for the Users & Access tests. Each test file mocks
 * `@/lib/presentation/hooks/shared` itself (vi.mock is hoisted per file). */

export const officeUser = (over: Partial<SchoolOfficeUser> = {}): SchoolOfficeUser => ({
  id: 'u-staff', firstName: 'Ada', lastName: 'Kollie', email: 'ada@school.lr', phoneNumber: null, photoUrl: null,
  role: 'INSTITUTION_STAFF', title: 'Registrar', modules: ['STUDENTS'], isActive: true,
  lastLoginAt: '2026-11-01T10:00:00.000Z', staffId: null, ...over,
});

export const adminUser = (over: Partial<SchoolOfficeUser> = {}): SchoolOfficeUser =>
  officeUser({
    id: 'u-admin', firstName: 'Musu', lastName: 'Sirleaf', email: 'principal@school.lr', role: 'INSTITUTION_ADMIN',
    title: null, modules: [], lastLoginAt: null, ...over,
  });

export const usersResult = (over: Partial<SchoolUsersResult> = {}): SchoolUsersResult => ({
  source: 'server',
  users: [adminUser(), officeUser()],
  linkableStaff: [{ id: 'st-1', firstName: 'Kofi', lastName: 'Doe', position: 'Teacher' }],
  ...over,
});

export function stubSchoolUsers(result: SchoolUsersResult = usersResult()) {
  stubNemis();
  const api = {
    list: vi.fn(async () => result),
    create: vi.fn(),
    update: vi.fn(async () => ({ data: officeUser(), refreshed: true })),
    setActive: vi.fn(async () => ({ data: officeUser({ isActive: false }), refreshed: true })),
  };
  Object.assign((window as unknown as { nemis: Record<string, unknown> }).nemis, { schoolUsers: api });
  return api;
}

export { clearNemis };

export async function renderWithToasts(ui: ReactElement) {
  const layer = createRendererPresentation();
  await layer.bootstrap.run();
  return render(
    <PresentationProvider layer={layer}>
      {ui}
      <ToastHost />
    </PresentationProvider>,
  );
}
