import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SystemRole } from '@nemis-desktop/types';
import type { DeoInfrastructureIssue, DeoInfrastructureResult } from '@nemis-desktop/types';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { sidebarConfigs } from '@/components/shell/sidebarConfig';
import DeoInfrastructureRoute from './page';

const SAVE_ERROR = "Couldn't save this action. Try again.";

const issue = (id: string, severity: string, status: string): DeoInfrastructureIssue =>
  ({
    id,
    title: `Issue ${id}`,
    schoolId: 's 1',
    schoolName: 'Alpha',
    category: 'FACILITIES',
    severity,
    status,
    note: 'n',
    reportedAt: '2025-02-10T00:00:00.000Z',
  }) as DeoInfrastructureIssue;

const result = (): DeoInfrastructureResult => ({
  districtId: 'd-1',
  district: { id: 'd-1', name: 'Kakata' },
  county: { id: 'c-1', name: 'Margibi' },
  summary: { totalIssues: 4, critical: 1, open: 3, escalated: 1 },
  issues: [
    issue('a', 'LOW', 'OPEN'),
    issue('b', 'HIGH', 'UNDER_REVIEW'),
    issue('c', 'CRITICAL', 'ESCALATED'),
    issue('d', 'MEDIUM', 'UNDER_REVIEW'),
  ],
});

function mockNemis(
  get: () => Promise<DeoInfrastructureResult> = async () => result(),
  review: (req: unknown) => Promise<boolean> = async () => true,
  escalate: (req: unknown) => Promise<boolean> = async () => true,
) {
  const getInfrastructure = vi.fn(get);
  const reviewInfrastructure = vi.fn(review);
  const resolveInfrastructure = vi.fn(async () => true);
  const escalateInfrastructure = vi.fn(escalate);
  (window as unknown as { nemis: unknown }).nemis = {
    deo: { getInfrastructure, reviewInfrastructure, resolveInfrastructure, escalateInfrastructure },
  };
  return { getInfrastructure, reviewInfrastructure, escalateInfrastructure };
}

function renderPage() {
  render(
    <PresentationProvider layer={createRendererPresentation()}>
      <DeoInfrastructureRoute />
    </PresentationProvider>,
  );
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

describe('DEO Infrastructure page', () => {
  it('shows the real district and county', async () => {
    mockNemis();
    renderPage();
    expect(await screen.findByText('Kakata · Margibi')).toBeInTheDocument();
    expect(screen.queryByText(/Buchanan/)).not.toBeInTheDocument();
  });

  it('status All chip comes first in its row, and Open then All shows every issue', async () => {
    mockNemis();
    renderPage();
    await screen.findByText('Issue a');
    const open = screen.getByRole('button', { name: /^Open/ });
    expect(open.previousElementSibling?.textContent).toMatch(/^All/);
    fireEvent.click(open);
    expect(screen.queryByText('Issue b')).not.toBeInTheDocument();
    const all = screen.getAllByRole('button', { name: /^All/ });
    fireEvent.click(all[all.length - 1]!);
    for (const id of ['a', 'b', 'c', 'd']) expect(screen.getByText(`Issue ${id}`)).toBeInTheDocument();
  });

  it('View School links to the details page with the encoded id', async () => {
    mockNemis();
    renderPage();
    const links = await screen.findAllByRole('link', { name: 'View School' });
    expect(links[0]).toHaveAttribute('href', '/government/deo/schools/details?id=s%201');
  });

  it('a false reply keeps the modal open with the message', async () => {
    const { reviewInfrastructure } = mockNemis(undefined, async () => false);
    renderPage();
    await screen.findByText('Issue a');
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark as Under Review' }));
    expect(await screen.findByText(SAVE_ERROR)).toBeInTheDocument();
    expect(reviewInfrastructure).toHaveBeenCalledWith({ issueId: 'a' });
    expect(screen.getByRole('button', { name: 'Mark as Under Review' })).toBeInTheDocument();
  });

  it('closing and reopening clears the message', async () => {
    mockNemis(undefined, async () => false);
    renderPage();
    await screen.findByText('Issue a');
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark as Under Review' }));
    await screen.findByText(SAVE_ERROR);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    await waitFor(() => expect(screen.queryByText(SAVE_ERROR)).not.toBeInTheDocument());
  });

  it('a successful review closes the modal', async () => {
    mockNemis();
    renderPage();
    await screen.findByText('Issue a');
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark as Under Review' }));
    await waitFor(() => expect(screen.queryByText('Review Infrastructure Issue')).not.toBeInTheDocument());
  });

  it('Escalate submit stays disabled until a non-blank reason is typed', async () => {
    const { escalateInfrastructure } = mockNemis();
    renderPage();
    await screen.findByText('Issue a');
    fireEvent.click(screen.getByRole('button', { name: 'Escalate' }));
    const submit = screen.getByRole('button', { name: 'Escalate to County' });
    expect(submit).toBeDisabled();
    const box = screen.getByPlaceholderText(/county-level attention/);
    fireEvent.change(box, { target: { value: '   ' } });
    expect(submit).toBeDisabled();
    fireEvent.change(box, { target: { value: 'Roof collapsed' } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() =>
      expect(escalateInfrastructure).toHaveBeenCalledWith({ issueId: 'b', reason: 'Roof collapsed' }),
    );
  });

  it('Escalate shows only on HIGH and CRITICAL open issues', async () => {
    mockNemis();
    renderPage();
    await screen.findByText('Issue a');
    expect(screen.getAllByRole('button', { name: 'Escalate' })).toHaveLength(1);
  });

  it('no Review on an UNDER_REVIEW issue', async () => {
    mockNemis();
    renderPage();
    await screen.findByText('Issue a');
    fireEvent.click(screen.getByRole('button', { name: /^Under Review/ }));
    expect(screen.queryByRole('button', { name: 'Review' })).not.toBeInTheDocument();
  });

  it('ESCALATED issue reads Escalated to County', async () => {
    mockNemis();
    renderPage();
    expect(await screen.findByText('Escalated to County')).toBeInTheDocument();
  });

  it('error offers retry that calls the bridge again', async () => {
    const { getInfrastructure } = mockNemis(async () => {
      throw new Error('boom');
    });
    renderPage();
    expect(await screen.findByText('Failed to load infrastructure issues.')).toBeInTheDocument();
    const before = getInfrastructure.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(getInfrastructure.mock.calls.length).toBeGreaterThan(before));
  });

  it('shows the no-district state', async () => {
    mockNemis(async () => ({ ...result(), districtId: null, district: null, county: null, issues: [] }));
    renderPage();
    expect(await screen.findByText('No district assigned to your account.')).toBeInTheDocument();
  });

  it('the DEO sidebar lists Infrastructure right after Transfers', () => {
    const items = sidebarConfigs[SystemRole.DEO].navGroups.flatMap((g) => g.items.map((i) => i.href));
    const at = items.indexOf('/government/deo/transfers');
    expect(items[at + 1]).toBe('/government/deo/infrastructure');
  });
});
