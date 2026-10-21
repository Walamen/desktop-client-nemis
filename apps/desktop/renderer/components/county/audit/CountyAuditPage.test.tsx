import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { CountyAuditPage } from './CountyAuditPage';

const log = (id: string, extra: Record<string, unknown> = {}) => ({
  id, action: 'CREATE', actionLabel: 'Created', entityType: 'Student', entityLabel: 'Student',
  actorName: `James ${id}`, scope: 'District', timestamp: '2026-10-20T10:00:00.000Z', ...extra,
});
const stats = {
  total: 120, today: 4, week: 30,
  actions: [{ value: 'CREATE', label: 'Created' }, { value: 'UPDATE', label: 'Updated' }],
  entityTypes: [{ value: 'feeRule', label: 'Fee Rule' }, { value: 'Staff', label: 'Staff' }],
};

function renderWith(overrides: Record<string, unknown> = {}) {
  const county = {
    getAuditStats: vi.fn(async () => stats),
    listAuditLogs: vi.fn(async (query: { page: number }) =>
      query.page === 1
        ? { items: Array.from({ length: 50 }, (_, i) => log(`p1-${i}`)), total: 51, page: 1, limit: 50 }
        : { items: [log('p2-0')], total: 51, page: 2, limit: 50 },
    ),
    ...overrides,
  };
  (window as unknown as { nemis: unknown }).nemis = { county };
  const layer = createRendererPresentation();
  render(
    <PresentationProvider layer={layer}>
      <CountyAuditPage />
    </PresentationProvider>,
  );
  return { county, layer };
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

const card = (label: string) => screen.getByText(label, { selector: 'p' }).nextElementSibling!.textContent;

describe('County Audit Trail page', () => {
  it('cards: Total for the last 12 months, Today, This Week, Last Synced', async () => {
    const { layer } = renderWith();
    await waitFor(() => expect(card('Total Actions')).toBe('120'));
    expect(screen.getByText('Last 12 months')).toBeInTheDocument();
    expect(card('Today')).toBe('4');
    expect(card('This Week')).toBe('30');
    expect(card('Last Synced')).toBe('Never');
    act(() => layer.stores.connectivity.store.setState({ lastSyncAt: new Date(Date.now() - 5 * 60_000).toISOString() }));
    expect(card('Last Synced')).toBe('5m ago');
    expect(screen.queryByText('Live Updates')).toBeNull();
  });

  it('timeline rows: action with entity, actor and a Scope pill', async () => {
    renderWith();
    await waitFor(() => expect(screen.getByText('James p1-0')).toBeInTheDocument());
    const row = screen.getByText('James p1-0').closest('tr')!;
    expect(within(row).getByText('Created Student')).toBeInTheDocument();
    expect(within(row).getByText('District')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('Scope')).toBeInTheDocument();
  });

  it('search is sent after a pause in typing', async () => {
    const { county } = renderWith();
    await waitFor(() => expect(screen.getByText('James p1-0')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('Search by user, action, or entity...'), { target: { value: 'jam' } });
    await waitFor(() => expect(county.listAuditLogs).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'jam', page: 1 })));
  });

  it('dropdowns come from the stats and filter exactly', async () => {
    const { county } = renderWith();
    await waitFor(() => expect(card('Total Actions')).toBe('120'));
    const [action, entity] = screen.getAllByRole('combobox') as HTMLSelectElement[];
    expect([...action!.options].map((o) => o.text)).toEqual(['All Actions', 'Created', 'Updated']);
    expect([...entity!.options].map((o) => o.text)).toEqual(['All Entities', 'Fee Rule', 'Staff']);
    fireEvent.change(entity!, { target: { value: 'feeRule' } });
    await waitFor(() => expect(county.listAuditLogs).toHaveBeenLastCalledWith(expect.objectContaining({ entityType: 'feeRule', page: 1 })));
  });

  it('Load more fetches page 2 and appends', async () => {
    const { county } = renderWith();
    await waitFor(() => expect(screen.getByText('James p1-0')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(screen.getByText('James p2-0')).toBeInTheDocument());
    expect(screen.getByText('James p1-0')).toBeInTheDocument();
    expect(county.listAuditLogs).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('nothing synced yet: No audit logs found', async () => {
    renderWith({
      getAuditStats: vi.fn(async () => ({ total: 0, today: 0, week: 0, actions: [], entityTypes: [] })),
      listAuditLogs: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 50 })),
    });
    await waitFor(() => expect(screen.getByText('No audit logs found')).toBeInTheDocument());
    expect(card('Total Actions')).toBe('0');
  });

  it('a load error says so', async () => {
    renderWith({ listAuditLogs: vi.fn(async () => Promise.reject(new Error('locked'))) });
    await waitFor(() => expect(screen.getByText('Error loading audit logs. Please try again later.')).toBeInTheDocument());
  });
});
