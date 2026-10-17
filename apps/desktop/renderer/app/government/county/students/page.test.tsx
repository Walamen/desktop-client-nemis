import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import StudentsPage from './page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

const student = (id: string, extra: Record<string, unknown> = {}) => ({
  id, firstName: 'Ada', lastName: `Kollie-${id}`, middleName: null, photoUrl: null, nemisId: '482915736045',
  isActive: true, gender: 'FEMALE',
  institution: { id: 'sch-a', name: 'Alpha School', districtName: 'Buchanan', countyName: 'Grand Bassa' },
  currentClass: { name: '5A', gradeLevel: 'GRADE_5' }, performanceLabel: 'Good', avgPercentage: 75, ...extra,
});

function renderWith(extra: Record<string, unknown> = {}) {
  const listStudents = vi.fn(async (query: { page: number }) => ({
    county: { id: 'county-1', name: 'Grand Bassa' },
    districts: [{ id: 'd-1', name: 'Buchanan' }],
    schools: [{ id: 'sch-a', name: 'Alpha School' }, { id: 'sch-b', name: 'Beta School' }],
    stats: { total: 10, male: 4, female: 3, active: 7, inactive: 3 },
    data: [student(`s-${query.page}`)],
    total: 13,
    page: query.page,
    limit: 12,
    totalPages: 2,
    ...extra,
  }));
  (window as unknown as { nemis: unknown }).nemis = { county: { listStudents } };
  render(
    <PresentationProvider layer={createRendererPresentation()}>
      <StudentsPage />
    </PresentationProvider>,
  );
  return listStudents;
}

const card = (label: string) => screen.getByText(label, { selector: 'p' }).parentElement!.textContent;

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

describe('County Students page', () => {
  it('shows the county header and real stat cards', async () => {
    renderWith();
    await waitFor(() => expect(screen.getByText('Grand Bassa')).toBeInTheDocument());
    expect(card('Total Students')).toContain('10');
    expect(card('Active')).toContain('7');
    expect(card('Inactive')).toContain('3');
    expect(card('Schools')).toContain('2');
  });

  it('passes each filter to the list with the web params, back on page 1', async () => {
    const listStudents = renderWith();
    await waitFor(() => expect(screen.getByText('Kollie-s-1', { exact: false })).toBeInTheDocument());
    const last = () => listStudents.mock.calls.at(-1)![0];
    fireEvent.change(screen.getByPlaceholderText('Name or ID…'), { target: { value: 'ada' } });
    await waitFor(() => expect(last()).toMatchObject({ search: 'ada', page: 1, limit: 12 }));
    const [schoolSelect, districtSelect, gradeSelect] = screen.getAllByRole('combobox');
    fireEvent.change(schoolSelect!, { target: { value: 'sch-b' } });
    await waitFor(() => expect(last()).toMatchObject({ institutionId: 'sch-b' }));
    fireEvent.change(districtSelect!, { target: { value: 'd-1' } });
    await waitFor(() => expect(last()).toMatchObject({ districtId: 'd-1' }));
    fireEvent.change(gradeSelect!, { target: { value: 'GRADE_5' } });
    await waitFor(() => expect(last()).toMatchObject({ gradeLevel: 'GRADE_5' }));
    fireEvent.click(screen.getByRole('button', { name: 'Good' }));
    await waitFor(() => expect(last()).toMatchObject({ performance: 'Good' }));
    fireEvent.click(screen.getByRole('button', { name: 'inactive' }));
    await waitFor(() => expect(last()).toMatchObject({ status: 'inactive', page: 1 }));
  });

  it('pages and links each student to its detail page', async () => {
    const listStudents = renderWith();
    await waitFor(() => expect(screen.getByText('Page 1 of 2')).toBeInTheDocument());
    expect(screen.getByText('Ada Kollie-s-1').closest('a')).toHaveAttribute('href', '/government/county/students/details?id=s-1');
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    await waitFor(() => expect(listStudents.mock.calls.at(-1)![0]).toMatchObject({ page: 2 }));
    await waitFor(() => expect(screen.getByText('Page 2 of 2')).toBeInTheDocument());
  });

  it('switches between table and cards', async () => {
    renderWith();
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Card view' }));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('Ada Kollie-s-1').closest('a')).toHaveAttribute('href', '/government/county/students/details?id=s-1');
    fireEvent.click(screen.getByRole('button', { name: 'Table view' }));
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('shows the web empty state', async () => {
    renderWith({ data: [], total: 0, totalPages: 0 });
    await waitFor(() => expect(screen.getByText('No students found matching your criteria.')).toBeInTheDocument());
  });
});
