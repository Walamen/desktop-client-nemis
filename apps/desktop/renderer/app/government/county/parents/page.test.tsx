import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import ParentsPage from './page';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

const guardian = (id: string, extra: Record<string, unknown> = {}) => ({
  id, firstName: 'Mary', lastName: `Kollie-${id}`, relationship: 'Mother', phoneNumber: '0770111222',
  email: 'mary@x.lr', photoUrl: null, studentsCount: 2, districts: ['Buchanan', 'Owensgrove'], ...extra,
});

function renderWith(extra: Record<string, unknown> = {}) {
  const listGuardians = vi.fn(async (query: { page: number }) => ({
    county: { id: 'county-1', name: 'Grand Bassa' },
    districts: [{ id: 'd-1', name: 'Buchanan' }],
    stats: { total: 10, primaryGuardians: 6, childrenCovered: 14 },
    data: [guardian(`g-${query.page}`), guardian('g-one', { studentsCount: 1, email: null, districts: [] })],
    total: 13,
    page: query.page,
    limit: 12,
    totalPages: 2,
    ...extra,
  }));
  (window as unknown as { nemis: unknown }).nemis = { county: { listGuardians } };
  render(
    <PresentationProvider layer={createRendererPresentation()}>
      <ParentsPage />
    </PresentationProvider>,
  );
  return listGuardians;
}

const card = (label: string) => screen.getByText(label, { selector: 'p' }).parentElement!.textContent;

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  push.mockClear();
});

describe('County Parents & Guardians page', () => {
  it('shows the county header and the three stat cards', async () => {
    renderWith();
    await waitFor(() => expect(screen.getByText('Grand Bassa')).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Parents & Guardians' })).toBeInTheDocument();
    expect(card('Total Parents / Guardians')).toContain('10');
    expect(card('Children Covered')).toContain('14');
    expect(card('Primary Guardians')).toContain('6');
    expect(screen.getByText('13', { exact: false, selector: 'span' }).parentElement!.textContent).toContain(
      '13 parents found',
    );
  });

  it('sends the relationship and district filters, back on page 1', async () => {
    const listGuardians = renderWith();
    await waitFor(() => expect(screen.getByText('Page 1 of 2')).toBeInTheDocument());
    const last = () => listGuardians.mock.calls.at(-1)![0];
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    await waitFor(() => expect(last()).toMatchObject({ page: 2 }));
    fireEvent.click(screen.getByRole('button', { name: 'Father' }));
    await waitFor(() => expect(last()).toMatchObject({ relationship: 'Father', page: 1, limit: 12 }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'd-1' } });
    await waitFor(() => expect(last()).toMatchObject({ relationship: 'Father', districtId: 'd-1', page: 1 }));
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    await waitFor(() => expect(last()).not.toHaveProperty('relationship'));
  });

  it('debounces the search before it reaches the query', async () => {
    const listGuardians = renderWith();
    await waitFor(() => expect(screen.getByText('Page 1 of 2')).toBeInTheDocument());
    const last = () => listGuardians.mock.calls.at(-1)![0];
    fireEvent.change(screen.getByPlaceholderText('Name, email, phone…'), { target: { value: 'ada' } });
    expect(last()).not.toHaveProperty('search');
    await waitFor(() => expect(last()).toMatchObject({ search: 'ada', page: 1 }));
  });

  it('cards show the child count, contact lines and a profile link', async () => {
    renderWith();
    await waitFor(() => expect(screen.getByText('2 children')).toBeInTheDocument());
    expect(screen.getByText('1 child')).toBeInTheDocument();
    expect(screen.getAllByText('0770111222')).toHaveLength(2);
    expect(screen.getAllByText('mary@x.lr')).toHaveLength(1);
    expect(screen.getAllByText('View Profile')[0]!.closest('a')).toHaveAttribute(
      'href',
      '/government/county/parents/details?id=g-1',
    );
  });

  it('the table lists districts and opens a profile from its row', async () => {
    renderWith();
    await waitFor(() => expect(screen.getByText('2 children')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Table view' }));
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Buchanan, Owensgrove')).toBeInTheDocument();
    expect(screen.getByText('Mary Kollie-g-one').closest('tr')!.textContent).toContain('—');
    fireEvent.click(screen.getByText('Mary Kollie-g-1').closest('tr')!);
    expect(push).toHaveBeenCalledWith('/government/county/parents/details?id=g-1');
    fireEvent.click(screen.getByRole('button', { name: 'Card view' }));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows a seven-button page window', async () => {
    renderWith({ totalPages: 9, total: 100 });
    await waitFor(() => expect(screen.getByText('Page 1 of 9')).toBeInTheDocument());
    for (const n of ['1', '2', '3', '4', '5', '6', '7']) expect(screen.getByRole('button', { name: n })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '8' })).not.toBeInTheDocument();
  });

  it('shows the web empty state', async () => {
    renderWith({ data: [], total: 0, totalPages: 1 });
    await waitFor(() => expect(screen.getByText('No parents found matching your criteria.')).toBeInTheDocument());
    expect(screen.queryByText(/^Page /)).not.toBeInTheDocument();
  });
});
