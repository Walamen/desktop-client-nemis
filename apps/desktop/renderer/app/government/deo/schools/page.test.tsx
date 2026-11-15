import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { DeoSchoolRow, DeoSchoolsResult } from '@nemis-desktop/types';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import DeoSchoolsPage from './page';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

function school(id: string, name: string, overrides: Partial<DeoSchoolRow> = {}): DeoSchoolRow {
  return {
    id,
    name,
    code: id.toUpperCase(),
    levels: ['PRIMARY'],
    students: 1200,
    teachers: 30,
    attendanceRate: 88,
    lastSubmissionAt: null,
    performanceStatus: 'Good',
    complianceStatus: 'Compliant',
    feeCollectionRate: null,
    principalName: 'Jallah Doe',
    reportMonths: [true, false, true],
    ...overrides,
  };
}

const RESULT: DeoSchoolsResult = {
  districtId: 'd-1',
  district: { id: 'd-1', name: 'Buchanan' },
  county: { id: 'c-1', name: 'Grand Bassa' },
  schools: [
    school('s-1', 'Alpha Academy'),
    school('s-2', 'Beta High', {
      levels: ['SECONDARY'],
      complianceStatus: 'Flagged',
      principalName: null,
      attendanceRate: null,
    }),
    school('s-3', 'Gamma School', { levels: ['PRIMARY', 'SECONDARY'], complianceStatus: 'Needs Review' }),
  ],
};

function mockNemis(result: DeoSchoolsResult) {
  const nemis = { deo: { listSchools: vi.fn(async () => result) } };
  (window as unknown as { nemis: unknown }).nemis = nemis;
  return nemis;
}

function renderPage() {
  render(
    <PresentationProvider layer={createRendererPresentation()}>
      <DeoSchoolsPage />
    </PresentationProvider>,
  );
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  push.mockReset();
});

describe('DEO Schools page', () => {
  it('names the district and county in the banner', async () => {
    mockNemis(RESULT);
    renderPage();
    expect(await screen.findByText('Schools Management')).toBeInTheDocument();
    expect(screen.getByText('Buchanan · Grand Bassa')).toBeInTheDocument();
    expect(screen.getByText('3 schools · Click a school to view details')).toBeInTheDocument();
  });

  it('leaves the district block out when no names have synced', async () => {
    mockNemis({ ...RESULT, district: null, county: null });
    renderPage();
    await screen.findByText('Alpha Academy');
    expect(screen.queryByText('District')).not.toBeInTheDocument();
  });

  it('shows each tab with its count, and the Secondary tab finds both secondary schools', async () => {
    mockNemis(RESULT);
    renderPage();
    await screen.findByText('Alpha Academy');
    const tab = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}\\s*\\d+$`) });
    expect(tab('All')).toHaveTextContent('3');
    expect(tab('Flagged')).toHaveTextContent('1');
    expect(tab('Secondary')).toHaveTextContent('2');
    fireEvent.click(tab('Secondary'));
    expect(screen.queryByText('Alpha Academy')).not.toBeInTheDocument();
    expect(screen.getByText('Beta High')).toBeInTheDocument();
    expect(screen.getByText('Gamma School')).toBeInTheDocument();
  });

  it('shows the principal, level, figures, report dots and status', async () => {
    mockNemis(RESULT);
    renderPage();
    const alpha = (await screen.findByText('Alpha Academy')).closest('tr') as HTMLElement;
    expect(within(alpha).getByText('Jallah Doe')).toBeInTheDocument();
    expect(within(alpha).getByText('Primary')).toBeInTheDocument();
    expect(within(alpha).getByText('1,200')).toBeInTheDocument();
    expect(within(alpha).getByText('88%')).toBeInTheDocument();
    expect(within(alpha).getByText('Compliant')).toBeInTheDocument();
    const dots = within(alpha).getByTitle('Reports submitted in each of the last three months').children;
    expect([...dots].map((dot) => dot.className.includes('bg-green-500'))).toEqual([true, false, true]);

    const beta = screen.getByText('Beta High').closest('tr') as HTMLElement;
    expect(within(beta).getByText('Not recorded')).toBeInTheDocument();
    expect(within(beta).getByText('—')).toBeInTheDocument();
    expect(within(beta).getByText('Flagged')).toBeInTheDocument();
  });

  it('opens the school detail page for a row', async () => {
    mockNemis(RESULT);
    renderPage();
    fireEvent.click(await screen.findByText('Gamma School'));
    expect(push).toHaveBeenCalledWith('/government/deo/schools/details?id=s-3');
  });

  it('shows the no-district message when no district is assigned', async () => {
    mockNemis({ districtId: null, district: null, county: null, schools: [] });
    renderPage();
    expect(await screen.findByText('No district assigned to your account.')).toBeInTheDocument();
  });

  it('shows an empty state for a district with no schools', async () => {
    mockNemis({ ...RESULT, schools: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText('No schools found')).toBeInTheDocument());
  });
});
