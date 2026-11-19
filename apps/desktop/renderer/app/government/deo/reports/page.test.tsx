import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DeoComplianceItem, DeoReportsComplianceResult } from '@nemis-desktop/types';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import DeoReportsPage from './page';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const base = { schoolId: 's-1', schoolName: 'Alpha', schoolCode: 'ALP', period: '2025', submittedBy: 'Ann', note: 'n' };

const item = (o: Partial<DeoComplianceItem> & Pick<DeoComplianceItem, 'id' | 'reportType' | 'status'>): DeoComplianceItem => ({
  ...base,
  date: '2025-02-10T00:00:00.000Z',
  ...o,
});

const RESULT: DeoReportsComplianceResult = {
  districtId: 'd-1',
  district: { id: 'd-1', name: 'Kakata' },
  county: { id: 'c-1', name: 'Margibi' },
  summary: { total: 3, approved: 1, pending: 1, rejected: 0, missing: 1 },
  items: [
    item({ id: '1', reportType: 'Registration', status: 'APPROVED' }),
    item({ id: '2', reportType: 'Teacher Roster', status: 'PENDING', date: '2025-02-11T00:00:00.000Z' }),
    item({ id: '3', reportType: 'Monthly Reports', status: 'MISSING', date: null }),
  ],
};

function mockNemis(impl: () => Promise<DeoReportsComplianceResult>) {
  const getReportsCompliance = vi.fn(impl);
  (window as unknown as { nemis: unknown }).nemis = { deo: { getReportsCompliance } };
  return getReportsCompliance;
}

function renderPage() {
  render(
    <PresentationProvider layer={createRendererPresentation()}>
      <DeoReportsPage />
    </PresentationProvider>,
  );
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  push.mockReset();
});

describe('DEO Reports & Compliance page', () => {
  it('shows the real district and county', async () => {
    mockNemis(async () => RESULT);
    renderPage();
    expect(await screen.findByText('Kakata · Margibi')).toBeInTheDocument();
    expect(screen.queryByText(/Buchanan/)).not.toBeInTheDocument();
  });

  it('has no download button', async () => {
    mockNemis(async () => RESULT);
    renderPage();
    await screen.findByText('Kakata · Margibi');
    expect(screen.queryByTitle('Open record')).not.toBeInTheDocument();
  });

  it('eye opens the school detail route', async () => {
    mockNemis(async () => RESULT);
    renderPage();
    const eyes = await screen.findAllByTitle('View school');
    fireEvent.click(eyes[0]!);
    expect(push).toHaveBeenCalledWith('/government/deo/schools/details?id=s-1');
  });

  it('null date reads Not submitted', async () => {
    mockNemis(async () => RESULT);
    renderPage();
    expect(await screen.findByText('Not submitted')).toBeInTheDocument();
  });

  it('type chips come from the rows', async () => {
    mockNemis(async () => RESULT);
    renderPage();
    await screen.findByText('Kakata · Margibi');
    for (const name of ['All', 'Registration', 'Teacher Roster', 'Monthly Reports']) {
      expect(screen.getAllByRole('button', { name }).length).toBeGreaterThan(0);
    }
    expect(screen.queryByRole('button', { name: 'Enrollment' })).not.toBeInTheDocument();
  });

  it('filters with no match show the empty text', async () => {
    mockNemis(async () => RESULT);
    renderPage();
    await screen.findByText('Kakata · Margibi');
    fireEvent.click(screen.getByRole('button', { name: /^Rejected/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Registration' }));
    expect(screen.getByText('No compliance records matched your filters.')).toBeInTheDocument();
  });

  it('shows the no-district state when the account has no district', async () => {
    mockNemis(async () => ({ ...RESULT, districtId: null, district: null, county: null, items: [] }));
    renderPage();
    expect(await screen.findByText('No district assigned to your account.')).toBeInTheDocument();
  });

  it('error offers retry that calls the bridge again', async () => {
    const call = mockNemis(async () => {
      throw new Error('boom');
    });
    renderPage();
    expect(await screen.findByText('Failed to load reports and compliance data.')).toBeInTheDocument();
    const before = call.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(call.mock.calls.length).toBeGreaterThan(before));
  });
});
