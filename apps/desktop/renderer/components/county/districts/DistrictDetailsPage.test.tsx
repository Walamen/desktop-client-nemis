import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { DistrictDetailsPage } from './DistrictDetailsPage';

let searchId: string | null = 'd-1';
vi.mock('next/navigation', () => ({ useSearchParams: () => ({ get: () => searchId }) }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

const school = (id: string, name: string, type: string) => ({
  id,
  name,
  code: id.toUpperCase(),
  type,
  emisCode: null,
  officialSchoolCode: null,
  street: '1 Road',
  communityTown: 'Buchanan City',
  ownership: 'PUBLIC',
  contactPhone: '0771',
  contactPersonPhone: null,
  metadata: { contact: { principal: 'Mr. Doe' }, statistics: { studentCount: 120, teacherCount: 6 } },
  isActive: true,
});

const DETAIL = {
  county: { id: 'county-1', name: 'Grand Bassa' },
  district: { id: 'd-1', name: 'Buchanan', code: 'D1', isActive: true },
  officers: [
    { userId: 'deo-1', name: 'Musu Kollie', email: 'musu@moe.gov.lr', phoneNumber: null, isActive: true, lastLoginAt: null, photoUrl: null },
  ],
  institutions: [school('a', 'Alpha High', 'SCHOOL'), school('t', 'Tech Institute', 'TVET')],
  stats: { totalSchools: 2, totalStudents: 250, totalTeachers: 7, deoCount: 1, studentTeacherRatio: 36 },
};

function renderWith(getDistrict: () => Promise<unknown>) {
  (window as unknown as { nemis: unknown }).nemis = { county: { getDistrict: vi.fn(getDistrict) } };
  render(
    <PresentationProvider layer={createRendererPresentation()}>
      <DistrictDetailsPage />
    </PresentationProvider>,
  );
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  searchId = 'd-1';
});

describe('County District Details page', () => {
  it('shows the header, DEO and stat cards, analytics and the SCHOOL-type table', async () => {
    renderWith(async () => DETAIL);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Buchanan' })).toBeInTheDocument());
    expect(screen.getByText(/Grand Bassa County · D1/)).toBeInTheDocument();
    expect(screen.getByText('Musu Kollie')).toBeInTheDocument();
    expect(screen.getByText('36')).toBeInTheDocument();
    expect(screen.getByText('Alpha High')).toBeInTheDocument();
    expect(screen.queryByText('Tech Institute')).not.toBeInTheDocument();
    expect(screen.getByText('Mr. Doe')).toBeInTheDocument();
    expect(screen.getAllByText('Back to Districts')[0]!.closest('a')).toHaveAttribute('href', '/government/county/districts');
  });

  it('shows the web error view for an unknown district', async () => {
    renderWith(async () => null);
    await waitFor(() =>
      expect(screen.getByText('Failed to load district details. Please try again.')).toBeInTheDocument(),
    );
  });

  it('shows the web error view when no id is given', async () => {
    searchId = null;
    renderWith(async () => DETAIL);
    await waitFor(() =>
      expect(screen.getByText('Failed to load district details. Please try again.')).toBeInTheDocument(),
    );
  });
});
