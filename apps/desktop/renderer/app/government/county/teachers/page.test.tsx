import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import TeachersPage from './page';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

const teacher = (id: string, extra: Record<string, unknown> = {}) => ({
  id, firstName: 'Musu', lastName: `Kollie-${id}`, middleName: null, photoUrl: null, employeeNumber: `GB-${id}`,
  position: 'TEACHER', isActive: true, gender: 'FEMALE', primarySubject: 'English',
  institution: { id: 'sch-a', name: 'Alpha School', level: 'PRIMARY', districtName: 'Buchanan', countyName: 'Grand Bassa' },
  ...extra,
});

function renderWith(listTeachers = page()) {
  (window as unknown as { nemis: unknown }).nemis = { county: { listTeachers } };
  render(
    <PresentationProvider layer={createRendererPresentation()}>
      <TeachersPage />
    </PresentationProvider>,
  );
  return listTeachers;
}

function page(extra: Record<string, unknown> = {}) {
  return vi.fn(async (query: { page: number }) => ({
    county: { id: 'county-1', name: 'Grand Bassa' },
    stats: { total: 9, active: 7, inactive: 2, unassigned: 3, subjects: ['English', 'Mathematics'] },
    data: [teacher(`t-${query.page}`)],
    total: 30,
    page: query.page,
    limit: 12,
    totalPages: 3,
    ...extra,
  }));
}

const card = (label: string) => screen.getByText(label, { selector: 'p' }).parentElement!.textContent;
const last = (mock: ReturnType<typeof page>) => mock.mock.calls.at(-1)![0];

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  push.mockReset();
});

describe('County Teachers page', () => {
  it('shows the four cards with real counts and the header total', async () => {
    renderWith();
    await waitFor(() => expect(screen.getByText('Grand Bassa')).toBeInTheDocument());
    expect(card('Total Teachers')).toContain('9');
    expect(card('Total Teachers')).toContain('Registered county-wide');
    expect(card('Active')).toContain('7');
    expect(card('Active')).toContain('Currently active');
    expect(card('Inactive')).toContain('2');
    expect(card('Inactive')).toContain('Not currently active');
    expect(card('Unassigned')).toContain('3');
    expect(card('Unassigned')).toContain('No class this year');
    expect(screen.queryByText('On Leave')).not.toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('shows cards by default and switches to the table', async () => {
    renderWith();
    await waitFor(() => expect(screen.getByText('View Profile')).toBeInTheDocument());
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Table view' }));
    expect(screen.getByRole('table')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Card view' }));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('passes search, category, subject and status to the query', async () => {
    const listTeachers = renderWith();
    await waitFor(() => expect(screen.getByText('View Profile')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('Name, ID, school…'), { target: { value: 'musu' } });
    await waitFor(() => expect(last(listTeachers)).toMatchObject({ search: 'musu', page: 1, limit: 12 }));
    fireEvent.click(screen.getByRole('button', { name: 'Technical' }));
    await waitFor(() => expect(last(listTeachers)).toMatchObject({ category: 'CERTIFICATE' }));
    const subject = screen.getByRole('combobox');
    expect([...subject.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      'All Subjects', 'English', 'Mathematics',
    ]);
    fireEvent.change(subject, { target: { value: 'Mathematics' } });
    await waitFor(() => expect(last(listTeachers)).toMatchObject({ subject: 'Mathematics' }));
    fireEvent.click(screen.getByRole('button', { name: 'Inactive' }));
    await waitFor(() => expect(last(listTeachers)).toMatchObject({ status: 'inactive' }));
  });

  it('resets to page 1 when a filter changes', async () => {
    const listTeachers = renderWith();
    await waitFor(() => expect(screen.getByText('Page 1 of 3')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    await waitFor(() => expect(screen.getByText('Page 3 of 3')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Active' }));
    await waitFor(() => expect(last(listTeachers)).toMatchObject({ status: 'active', page: 1 }));
    await waitFor(() => expect(screen.getByText('Page 1 of 3')).toBeInTheDocument());
  });

  it('links a teacher to details?id=', async () => {
    renderWith();
    await waitFor(() => expect(screen.getByText('View Profile')).toBeInTheDocument());
    expect(screen.getByText('View Profile').closest('a')).toHaveAttribute('href', '/government/county/teachers/details?id=t-1');
    fireEvent.click(screen.getByRole('button', { name: 'Table view' }));
    fireEvent.click(screen.getByText('Musu Kollie-t-1'));
    expect(push).toHaveBeenCalledWith('/government/county/teachers/details?id=t-1');
  });

  it('shows the web error banners and retries', async () => {
    let fail = true;
    const listTeachers = vi.fn(async (query: { page: number }) => {
      if (fail) throw new Error('database locked');
      return page()(query);
    });
    renderWith(listTeachers as unknown as ReturnType<typeof page>);
    await waitFor(() => expect(screen.getByText('Unable to load teachers')).toBeInTheDocument());
    expect(screen.getByText('Failed to load teacher statistics')).toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByText('View Profile')).toBeInTheDocument());
  });
});
