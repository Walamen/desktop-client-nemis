import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import SchoolsPage from './page';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

const school = (i: number, extra: Record<string, unknown> = {}) => ({
  id: `s-${i}`,
  name: `School ${String(i).padStart(2, '0')}`,
  code: `SC${i}`,
  type: 'SCHOOL',
  isActive: true,
  districtName: i % 2 ? 'Buchanan' : 'Owensgrove',
  levels: i % 2 ? ['PRIMARY'] : ['SECONDARY'],
  studentCount: 10,
  photoUrl: null,
  syncState: null,
  syncError: null,
  ...extra,
});

function renderWith(schools: unknown[]) {
  (window as unknown as { nemis: unknown }).nemis = {
    county: {
      listSchools: vi.fn(async () => ({ county: { id: 'county-1', name: 'Grand Bassa' }, districtCount: 2, schools })),
    },
  };
  render(
    <PresentationProvider layer={createRendererPresentation()}>
      <SchoolsPage />
    </PresentationProvider>,
  );
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  push.mockReset();
});

describe('County Schools page', () => {
  it('a school saved on this device shows its sync badge', async () => {
    renderWith([school(1, { syncState: 'pending' }), school(2, { syncState: 'rejected', syncError: 'Email taken' })]);
    await waitFor(() => expect(screen.getAllByText('Waiting to sync').length).toBeGreaterThan(0));
    expect(screen.getAllByText("Couldn't be added").length).toBeGreaterThan(0);
  });

  it('renders the header and stat cards', async () => {
    renderWith([school(1), school(2)]);
    await waitFor(() => expect(screen.getByText('Grand Bassa')).toBeInTheDocument());
    expect(screen.getByText('Total Schools').parentElement!.textContent).toContain('2');
    expect(screen.getByText('Total Enrollment').parentElement!.textContent).toContain('20');
    expect(screen.getByText('Districts').closest('a')).toHaveAttribute('href', '/government/county/districts');
  });

  it('searches by district name and filters by school type', async () => {
    renderWith([school(1), school(2)]);
    await waitFor(() => expect(screen.getByText('School 01')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('Name, code, district…'), { target: { value: 'owens' } });
    expect(screen.queryByText('School 01')).not.toBeInTheDocument();
    expect(screen.getByText('School 02')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Name, code, district…'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Primary' }));
    expect(screen.getByText('School 01')).toBeInTheDocument();
    expect(screen.queryByText('School 02')).not.toBeInTheDocument();
  });

  it('shows the web empty state when the status filter matches none', async () => {
    renderWith([school(1)]);
    await waitFor(() => expect(screen.getByText('School 01')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Inactive' }));
    expect(screen.getByText('No schools found matching your criteria.')).toBeInTheDocument();
  });

  it('pages at 10 schools', async () => {
    renderWith(Array.from({ length: 11 }, (_, i) => school(i + 1)));
    await waitFor(() => expect(screen.getByText('Page 1 of 2')).toBeInTheDocument());
    expect(screen.queryByText('School 11')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(screen.getByText('School 11')).toBeInTheDocument();
  });

  it('View School routes to the detail page with the id in the query, and the header buttons route', async () => {
    renderWith([school(1)]);
    await waitFor(() => expect(screen.getByText('View School →')).toBeInTheDocument());
    fireEvent.click(screen.getByText('View School →'));
    expect(push).toHaveBeenCalledWith('/government/county/schools/details?id=s-1');
    fireEvent.click(screen.getByText('Add School'));
    expect(push).toHaveBeenCalledWith('/government/county/schools/create');
    fireEvent.click(screen.getByText('Bulk Import'));
    expect(push).toHaveBeenCalledWith('/government/county/schools/bulk-import');
  });

  it('switches to the table view', async () => {
    renderWith([school(1)]);
    await waitFor(() => expect(screen.getByText('School 01')).toBeInTheDocument());
    const toggles = within(screen.getByText('schools found').parentElement!.parentElement!).getAllByRole('button');
    fireEvent.click(toggles[1]!);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});
