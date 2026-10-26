import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import type { YearClosureRow } from '@nemis-desktop/types';
import type { ReactElement } from 'react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { YearClosuresPanel } from './YearClosuresPanel';

function renderIn(ui: ReactElement) {
  return render(<PresentationProvider layer={createRendererPresentation()}>{ui}</PresentationProvider>);
}

const row = (over: Partial<YearClosureRow> = {}): YearClosureRow => ({
  academicYearId: 'y-1',
  yearCode: '2025/2026',
  institutionId: 's-1',
  schoolName: 'Monrovia Central High',
  status: 'CLOSED',
  closedAt: '2026-07-10T00:00:00.000Z',
  promoted: 20,
  retained: 5,
  graduated: 4,
  ...over,
});

function mockApi(list: () => Promise<YearClosureRow[]>) {
  (window as unknown as { nemis: unknown }).nemis = { yearArchives: { list } };
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

describe('YearClosuresPanel', () => {
  it('lists a row per school with year, status, date and counts', async () => {
    mockApi(() =>
      Promise.resolve([row(), row({ academicYearId: 'y-2', schoolName: 'Paynesville Academy', status: 'REOPENED' })]),
    );
    renderIn(<YearClosuresPanel />);
    const first = (await screen.findByText('Monrovia Central High')).closest('tr') as HTMLElement;
    const cells = within(first).getAllByRole('cell').map((c) => c.textContent);
    expect(cells).toEqual(['Monrovia Central High', '2025/2026', 'Closed', '2026-07-10', '20', '5', '4']);
    const second = screen.getByText('Paynesville Academy').closest('tr') as HTMLElement;
    expect(within(second).getByText('Reopened')).toBeInTheDocument();
  });

  it('shows the empty copy', async () => {
    mockApi(() => Promise.resolve([]));
    renderIn(<YearClosuresPanel />);
    expect(await screen.findByText('No school has closed an academic year yet.')).toBeInTheDocument();
  });

  it('shows an error when loading fails', async () => {
    mockApi(vi.fn().mockRejectedValue(new Error('boom')));
    renderIn(<YearClosuresPanel />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
