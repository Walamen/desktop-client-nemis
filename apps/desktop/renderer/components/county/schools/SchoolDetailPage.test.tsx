import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { SchoolDetailPage } from './SchoolDetailPage';

let searchId: string | null = 's-1';
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => searchId }),
  useRouter: () => ({ push }),
}));

const SCHOOL = {
  id: 's-1', name: 'Alpha High', code: 'AH', type: 'SCHOOL', ownership: 'GOVERNMENT', approvalStatus: 'APPROVED', isActive: true,
  street: '1 Road', communityTown: null, contactPhone: '0771', contactPersonPhone: '0772', emisCode: 'EMIS-1', officialSchoolCode: null,
  metadata: { statistics: { maxCapacity: 200 } }, levels: ['PRIMARY', 'SECONDARY'],
  details: {
    establishedYear: 1998, numClassrooms: 12, numBuildings: 3, numBathrooms: 4, isBoarding: false, isUrban: true,
    accessMode: 'ROAD', waecCode: 'W-1', hasLibrary: true, hasClinic: false,
  },
  districtName: 'Buchanan', countyName: 'Grand Bassa', studentCount: 170, staffCount: 9,
  principal: { firstName: 'Ada', lastName: 'Doe', email: 'ada@school.lr', photoUrl: null },
  registration: null,
};

function renderWith(getSchool: (id: string) => Promise<unknown>) {
  (window as unknown as { nemis: unknown }).nemis = { county: { getSchool: vi.fn(getSchool) } };
  // One layer for the whole test: the detail view model is an app-lifetime
  // singleton, which is exactly what the previous-school test exercises.
  const layer = createRendererPresentation();
  const view = render(
    <PresentationProvider layer={layer}>
      <SchoolDetailPage />
    </PresentationProvider>,
  );
  const rerender = () =>
    view.rerender(
      <PresentationProvider layer={layer}>
        <SchoolDetailPage />
      </PresentationProvider>,
    );
  return { rerender };
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  searchId = 's-1';
  push.mockReset();
});

describe('County School detail page', () => {
  it('shows the header, quick stats, information, leadership, compliance and facilities', async () => {
    renderWith(async () => SCHOOL);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Alpha High' })).toBeInTheDocument());
    expect(screen.getByText('AH · Buchanan · Grand Bassa · Est. 1998')).toBeInTheDocument();
    expect(screen.getAllByText('85%').length).toBeGreaterThan(0); // 170 / 200
    expect(screen.getByText('High Standing')).toBeInTheDocument();
    // portal-web formatLevel only capitalises first letters, so enum values stay upper-case.
    expect(screen.getByText('PRIMARY, SECONDARY')).toBeInTheDocument();
    expect(screen.getByText('Urban')).toBeInTheDocument();
    expect(screen.getByText('Road')).toBeInTheDocument();
    expect(screen.getByText('Ada Doe')).toBeInTheDocument();
    expect(screen.getByText('MoE Approved')).toBeInTheDocument();
    expect(screen.getByText('Library')).toBeInTheDocument();
    expect(screen.queryByText('Clinic')).not.toBeInTheDocument();
  });

  it('renders a school whose details have not synced', async () => {
    renderWith(async () => ({ ...SCHOOL, details: null, metadata: null }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Alpha High' })).toBeInTheDocument());
    expect(screen.getByText('Capacity not set')).toBeInTheDocument();
    expect(screen.queryByText('Facilities & Infrastructure')).not.toBeInTheDocument();
  });

  it('shows the web not-found view for an unknown school', async () => {
    renderWith(async () => null);
    await waitFor(() => expect(screen.getByText("School not found or you don't have access.")).toBeInTheDocument());
  });

  it('shows the web not-found view when no id is given', async () => {
    searchId = null;
    renderWith(async () => SCHOOL);
    await waitFor(() => expect(screen.getByText("School not found or you don't have access.")).toBeInTheDocument());
  });

  it('does not show the previously opened school', async () => {
    const { rerender } = renderWith(async (id) => (id === 's-1' ? SCHOOL : new Promise(() => {})));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Alpha High' })).toBeInTheDocument());
    searchId = 's-2';
    rerender();
    // Neither A's data nor a "not found" warning while B loads — only the spinner.
    expect(screen.queryByText("School not found or you don't have access.")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Alpha High' })).not.toBeInTheDocument());
    expect(screen.queryByText("School not found or you don't have access.")).not.toBeInTheDocument();
  });

  it('does not flash a stale not-found result from a previous id', async () => {
    const { rerender } = renderWith(async (id) => (id === 's-1' ? null : new Promise(() => {})));
    await waitFor(() => expect(screen.getByText("School not found or you don't have access.")).toBeInTheDocument());
    searchId = 's-2';
    rerender();
    expect(screen.queryByText("School not found or you don't have access.")).not.toBeInTheDocument();
  });
});
