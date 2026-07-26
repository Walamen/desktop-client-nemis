import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { StudentsDirectoryPage } from './StudentsDirectoryPage';

function stubNemis() {
  (window as unknown as { nemis: unknown }).nemis = {
    student: {
      list: vi.fn(async () => ({ data: [], total: 0, page: 1, pageSize: 12, totalPages: 0 })),
      getStatistics: vi.fn(async () => ({
        totalStudents: 42,
        maleStudents: 20,
        femaleStudents: 22,
        recentEnrollments: 5,
      })),
    },
    school: { getSummary: vi.fn(async () => null) },
    'academic-year': undefined,
    academicYear: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => []) },
    term: { getCurrent: vi.fn(async () => null) },
    class: { list: vi.fn(async () => ({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 })) },
    classes: { list: vi.fn(async () => ({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 })) },
  };
}

beforeEach(stubNemis);
afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

describe('StudentsDirectoryPage stat cards', () => {
  it('shows real statistics counts, not the loaded page size', async () => {
    const layer = createRendererPresentation();
    render(
      <PresentationProvider layer={layer}>
        <StudentsDirectoryPage />
      </PresentationProvider>,
    );
    await waitFor(() => expect(screen.getByText('42')).toBeInTheDocument());
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('22')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });
});

describe('StudentsDirectoryPage filters', () => {
  it('debounces the keyword filter and refetches without a Search button', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const listMock = vi.fn(async () => ({ data: [], total: 0, page: 1, pageSize: 12, totalPages: 0 }));
    (window as unknown as { nemis: unknown }).nemis = {
      student: {
        list: listMock,
        getStatistics: vi.fn(async () => ({ totalStudents: 0, maleStudents: 0, femaleStudents: 0, recentEnrollments: 0 })),
      },
      school: { getSummary: vi.fn(async () => null) },
      academicYear: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => []) },
      term: { getCurrent: vi.fn(async () => null) },
      classes: { list: vi.fn(async () => ({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 })) },
    };
    const layer = createRendererPresentation();
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup({ delay: null });
    render(
      <PresentationProvider layer={layer}>
        <StudentsDirectoryPage />
      </PresentationProvider>,
    );
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1)); // initial load on mount
    await user.type(screen.getByPlaceholderText('Name or student number'), 'Grace');
    expect(listMock).toHaveBeenCalledTimes(1); // not yet — still debouncing
    vi.advanceTimersByTime(350);
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2));
    const secondCallArgs = listMock.mock.calls[1] as unknown[] | undefined;
    expect(secondCallArgs?.[0]).toMatchObject({ keyword: 'Grace' });
    vi.useRealTimers();
  });
});

describe('StudentsDirectoryPage view toggle', () => {
  it('switches between table and grid without refetching', async () => {
    (window as unknown as { nemis: unknown }).nemis = {
      student: {
        list: vi.fn(async () => ({
          items: [
            { id: 's-1', fullName: 'Grace Toe', admissionNumber: 'ADM-1', gradeLevel: 'Grade 1', gender: 'Female', isActive: true, updatedAt: '2026-07-01' },
          ],
          total: 1, limit: 12, offset: 0,
        })),
        getStatistics: vi.fn(async () => ({ totalStudents: 1, maleStudents: 0, femaleStudents: 1, recentEnrollments: 1 })),
      },
      school: { getSummary: vi.fn(async () => null) },
      academicYear: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => []) },
      term: { getCurrent: vi.fn(async () => null) },
      classes: { list: vi.fn(async () => ({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 })) },
    };
    const layer = createRendererPresentation();
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(
      <PresentationProvider layer={layer}>
        <StudentsDirectoryPage />
      </PresentationProvider>,
    );
    await waitFor(() => expect(screen.getByText('Grace Toe')).toBeInTheDocument());
    expect(screen.getByRole('table')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /grid view/i }));
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('Grace Toe')).toBeInTheDocument();
  });
});
