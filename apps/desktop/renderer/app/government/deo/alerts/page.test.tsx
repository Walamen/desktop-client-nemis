import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DeoAlertListItem, DeoAlertsResult } from '@nemis-desktop/types';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import DeoAlertsRoute from './page';

const base = {
  type: 'LOW_ATTENDANCE',
  severity: 'HIGH',
  description: 'desc',
  isResolved: false,
  resolvedAt: null,
  createdAt: '2025-02-10T00:00:00.000Z',
} as const;

const alert = (o: Partial<DeoAlertListItem> & Pick<DeoAlertListItem, 'id' | 'title'>): DeoAlertListItem =>
  ({ ...base, institutionId: null, schoolName: null, ...o }) as DeoAlertListItem;

function result(totalPages = 1, alerts?: DeoAlertListItem[]): DeoAlertsResult {
  return {
    districtId: 'd-1',
    district: { id: 'd-1', name: 'Kakata' },
    county: { id: 'c-1', name: 'Margibi' },
    alerts: alerts ?? [
      alert({ id: 'a1', title: 'School alert', institutionId: 's-1', schoolName: 'Alpha' }),
      alert({ id: 'a2', title: 'District alert' }),
    ],
    meta: { page: 1, limit: 15, total: 16, totalPages },
  };
}

function mockNemis(
  impl: (args: { filter: string; page: number }) => Promise<DeoAlertsResult>,
  resolveImpl: (id: string) => Promise<boolean> = async () => true,
) {
  const listAlerts = vi.fn(impl);
  const resolveAlert = vi.fn(resolveImpl);
  (window as unknown as { nemis: unknown }).nemis = { deo: { listAlerts, resolveAlert } };
  return { listAlerts, resolveAlert };
}

function renderPage() {
  render(
    <PresentationProvider layer={createRendererPresentation()}>
      <DeoAlertsRoute />
    </PresentationProvider>,
  );
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

describe('DEO Alerts page', () => {
  it('shows the real district and county', async () => {
    mockNemis(async () => result());
    renderPage();
    expect(await screen.findByText('Kakata · Margibi')).toBeInTheDocument();
    expect(screen.queryByText(/Buchanan/)).not.toBeInTheDocument();
  });

  it('shows the school line only for school alerts', async () => {
    mockNemis(async () => result());
    renderPage();
    expect(await screen.findByText('School: Alpha')).toBeInTheDocument();
    expect(screen.getAllByText(/School:/)).toHaveLength(1);
  });

  it('shows a resolve failure next to the alert', async () => {
    mockNemis(
      async () => result(),
      async () => {
        throw new Error('nope');
      },
    );
    renderPage();
    const buttons = await screen.findAllByRole('button', { name: 'Resolve' });
    fireEvent.click(buttons[0]!);
    expect(await screen.findByText("Couldn't resolve this alert. Try again.")).toBeInTheDocument();
    expect(screen.getAllByText(/Couldn't resolve/)).toHaveLength(1);
  });

  it('open empty text', async () => {
    mockNemis(async () => result(1, []));
    renderPage();
    expect(await screen.findByText('No open alerts — all clear!')).toBeInTheDocument();
  });

  it('pagination only with more than one page', async () => {
    mockNemis(async () => result(1));
    const { unmount } = render(
      <PresentationProvider layer={createRendererPresentation()}>
        <DeoAlertsRoute />
      </PresentationProvider>,
    );
    await screen.findByText('Kakata · Margibi');
    expect(screen.queryByText(/Page 1 of/)).not.toBeInTheDocument();
    unmount();
    mockNemis(async () => result(2));
    renderPage();
    expect(await screen.findByText(/Page 1 of 2 \(16 total\)/)).toBeInTheDocument();
  });

  it('changing the select to Resolved asks for the resolved list', async () => {
    const { listAlerts } = mockNemis(async () => result());
    renderPage();
    await screen.findByText('Kakata · Margibi');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'resolved' } });
    await waitFor(() => expect(listAlerts).toHaveBeenCalledWith({ filter: 'resolved', page: 1 }));
  });

  it('shows the no-district state when the account has no district', async () => {
    mockNemis(async () => ({ ...result(), districtId: null, district: null, county: null, alerts: [] }));
    renderPage();
    expect(await screen.findByText('No district assigned to your account.')).toBeInTheDocument();
  });

  it('error offers retry that calls the bridge again', async () => {
    const { listAlerts } = mockNemis(async () => {
      throw new Error('boom');
    });
    renderPage();
    expect(await screen.findByText('Failed to load alerts.')).toBeInTheDocument();
    const before = listAlerts.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(listAlerts.mock.calls.length).toBeGreaterThan(before));
  });
});
