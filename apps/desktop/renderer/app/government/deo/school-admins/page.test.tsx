import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { DeoSchoolAdmin, DeoSchoolAdminsResult } from '@nemis-desktop/types';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import DeoSchoolAdminsPage from './page';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function admin(userId: string, firstName: string, overrides: Partial<DeoSchoolAdmin> = {}): DeoSchoolAdmin {
  return {
    userId,
    firstName,
    lastName: 'Doe',
    photoUrl: null,
    schoolId: 's-1',
    schoolName: 'Alpha Academy',
    employeeNumber: 'EMP-007',
    isActive: true,
    joinedAt: '2025-02-03T00:00:00.000Z',
    lastLoginAt: null,
    reportsThisMonth: 2,
    openInfrastructureIssues: 0,
    ...overrides,
  };
}

const RESULT: DeoSchoolAdminsResult = {
  districtId: 'd-1',
  district: { id: 'd-1', name: 'Buchanan' },
  county: { id: 'c-1', name: 'Grand Bassa' },
  admins: [
    admin('u-1', 'Ann'),
    admin('u-2', 'Musu', {
      isActive: false,
      schoolName: 'Beta High',
      employeeNumber: null,
      joinedAt: null,
      openInfrastructureIssues: 3,
    }),
  ],
  schoolsWithoutAdmin: [{ id: 's-3', name: 'Gamma School' }],
};

function mockNemis(result: DeoSchoolAdminsResult) {
  (window as unknown as { nemis: unknown }).nemis = { deo: { listSchoolAdmins: vi.fn(async () => result) } };
}

function renderPage() {
  render(
    <PresentationProvider layer={createRendererPresentation()}>
      <DeoSchoolAdminsPage />
    </PresentationProvider>,
  );
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

describe('DEO School Admins page', () => {
  it('names the district and counts the admins', async () => {
    mockNemis(RESULT);
    renderPage();
    expect(await screen.findByText('School Admin Directory')).toBeInTheDocument();
    expect(screen.getByText('Buchanan · Grand Bassa')).toBeInTheDocument();
    const kpi = (label: string) => screen.getByText(label, { selector: 'p' }).parentElement as HTMLElement;
    expect(within(kpi('Total Admins')).getByText('2')).toBeInTheDocument();
    expect(within(kpi('Active')).getByText('1')).toBeInTheDocument();
    expect(within(kpi('Suspended')).getByText('1')).toBeInTheDocument();
  });

  it('describes each account', async () => {
    mockNemis(RESULT);
    renderPage();
    const ann = (await screen.findByText('Ann Doe')).closest('[data-admin]') as HTMLElement;
    expect(within(ann).getByText('Principal · Alpha Academy')).toBeInTheDocument();
    expect(within(ann).getByText('ID: EMP-007 · Joined: Feb 03, 2025')).toBeInTheDocument();
    expect(within(ann).queryByText(/reports this month/)).not.toBeInTheDocument();
    expect(within(ann).getByText('Last active: Never signed in')).toBeInTheDocument();
    expect(within(ann).getByText('Active')).toBeInTheDocument();
    expect(within(ann).getByLabelText('Message Ann Doe')).toHaveAttribute('href', '/government/deo/messages?userId=u-1');

    const musu = screen.getByText('Musu Doe').closest('[data-admin]') as HTMLElement;
    expect(within(musu).queryByText(/ID:|Joined:/)).not.toBeInTheDocument();
    expect(within(musu).getByText('3 open infrastructure issues')).toBeInTheDocument();
    expect(within(musu).getByText('Suspended')).toBeInTheDocument();
  });

  it('filters to the suspended accounts', async () => {
    mockNemis(RESULT);
    renderPage();
    await screen.findByText('Ann Doe');
    fireEvent.click(screen.getByRole('button', { name: 'Suspended' }));
    expect(screen.queryByText('Ann Doe')).not.toBeInTheDocument();
    expect(screen.getByText('Musu Doe')).toBeInTheDocument();
  });

  it('names the schools without a School Admin', async () => {
    mockNemis(RESULT);
    renderPage();
    expect(await screen.findByText('No School Admin: Gamma School')).toBeInTheDocument();
  });

  it('shows an empty directory for a district with no School Admins', async () => {
    mockNemis({ ...RESULT, admins: [] });
    renderPage();
    expect(await screen.findByText('No school admins found')).toBeInTheDocument();
  });

  it('shows the no-district message when no district is assigned', async () => {
    mockNemis({ districtId: null, district: null, county: null, admins: [], schoolsWithoutAdmin: [] });
    renderPage();
    expect(await screen.findByText('No district assigned to your account.')).toBeInTheDocument();
  });
});
