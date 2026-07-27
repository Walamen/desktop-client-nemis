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
    class: {
      list: vi.fn(async () => ({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 })),
    },
    classes: {
      list: vi.fn(async () => ({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 })),
    },
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
    const listMock = vi.fn(async () => ({
      data: [],
      total: 0,
      page: 1,
      pageSize: 12,
      totalPages: 0,
    }));
    (window as unknown as { nemis: unknown }).nemis = {
      student: {
        list: listMock,
        getStatistics: vi.fn(async () => ({
          totalStudents: 0,
          maleStudents: 0,
          femaleStudents: 0,
          recentEnrollments: 0,
        })),
      },
      school: { getSummary: vi.fn(async () => null) },
      academicYear: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => []) },
      term: { getCurrent: vi.fn(async () => null) },
      classes: {
        list: vi.fn(async () => ({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 })),
      },
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
            {
              id: 's-1',
              fullName: 'Grace Toe',
              admissionNumber: 'ADM-1',
              gradeLevel: 'Grade 1',
              gender: 'Female',
              isActive: true,
              updatedAt: '2026-07-01',
            },
          ],
          total: 1,
          limit: 12,
          offset: 0,
        })),
        getStatistics: vi.fn(async () => ({
          totalStudents: 1,
          maleStudents: 0,
          femaleStudents: 1,
          recentEnrollments: 1,
        })),
      },
      school: { getSummary: vi.fn(async () => null) },
      academicYear: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => []) },
      term: { getCurrent: vi.fn(async () => null) },
      classes: {
        list: vi.fn(async () => ({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 })),
      },
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

describe('StudentsDirectoryPage pagination', () => {
  it('windows the page-button strip instead of rendering one button per page', async () => {
    (window as unknown as { nemis: unknown }).nemis = {
      student: {
        list: vi.fn(async () => ({
          items: [
            {
              id: 's-1',
              fullName: 'Grace Toe',
              admissionNumber: 'ADM-1',
              gradeLevel: 'Grade 1',
              gender: 'Female',
              isActive: true,
              updatedAt: '2026-07-01',
            },
          ],
          total: 600, // pageSize 12 => 50 pages
          limit: 12,
          offset: 0,
        })),
        getStatistics: vi.fn(async () => ({
          totalStudents: 600,
          maleStudents: 300,
          femaleStudents: 300,
          recentEnrollments: 10,
        })),
      },
      school: { getSummary: vi.fn(async () => null) },
      academicYear: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => []) },
      term: { getCurrent: vi.fn(async () => null) },
      classes: {
        list: vi.fn(async () => ({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 })),
      },
    };
    const layer = createRendererPresentation();
    render(
      <PresentationProvider layer={layer}>
        <StudentsDirectoryPage />
      </PresentationProvider>,
    );
    await waitFor(() => expect(screen.getByText('Grace Toe')).toBeInTheDocument());
    const pageButtons = screen.getAllByRole('button', { name: /^\d+$/ });
    // 50 true pages must never render as 50 buttons — the window is bounded
    // regardless of how many pages exist.
    expect(pageButtons.length).toBeLessThan(10);
    expect(pageButtons.length).toBeLessThan(50);
    // First and last page are always reachable.
    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '50' })).toBeInTheDocument();
  });
});

describe('StudentsDirectoryPage edit drawer', () => {
  it('opens a drawer with the student loaded, not a route navigation', async () => {
    const getMock = vi.fn(async () => ({
      id: 's-1',
      institutionId: 'inst-1',
      firstName: 'Grace',
      lastName: 'Toe',
      fullName: 'Grace Toe',
      admissionNumber: 'ADM-1',
      dateOfBirth: '2015-01-01T00:00:00.000Z',
      gender: 'FEMALE',
      isActive: true,
      version: 1,
      updatedAt: '2026-07-01T00:00:00.000Z',
      guardians: [],
    }));
    (window as unknown as { nemis: unknown }).nemis = {
      student: {
        list: vi.fn(async () => ({
          items: [
            {
              id: 's-1',
              fullName: 'Grace Toe',
              admissionNumber: 'ADM-1',
              gradeLevel: 'Grade 1',
              gender: 'Female',
              isActive: true,
              updatedAt: '2026-07-01',
            },
          ],
          total: 1,
          limit: 12,
          offset: 0,
        })),
        get: getMock,
        getStatistics: vi.fn(async () => ({
          totalStudents: 1,
          maleStudents: 0,
          femaleStudents: 1,
          recentEnrollments: 1,
        })),
      },
      school: { getSummary: vi.fn(async () => null) },
      academicYear: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => []) },
      term: { getCurrent: vi.fn(async () => null) },
      classes: {
        list: vi.fn(async () => ({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 })),
      },
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
    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    expect(screen.getByText('Edit Student')).toBeInTheDocument();
    await waitFor(() => expect(getMock).toHaveBeenCalledWith('s-1'));
    await waitFor(() => expect(screen.getByDisplayValue('Grace')).toBeInTheDocument());
  });

  it('submits changes via updateStudent, closes the drawer, and refetches the list', async () => {
    const listMock = vi.fn(async () => ({
      items: [
        {
          id: 's-1',
          fullName: 'Grace Toe',
          admissionNumber: 'ADM-1',
          gradeLevel: 'Grade 1',
          gender: 'Female',
          isActive: true,
          updatedAt: '2026-07-01',
        },
      ],
      total: 1,
      limit: 12,
      offset: 0,
    }));
    const getMock = vi.fn(async () => ({
      id: 's-1',
      institutionId: 'inst-1',
      firstName: 'Grace',
      lastName: 'Toe',
      fullName: 'Grace Toe',
      admissionNumber: 'ADM-1',
      dateOfBirth: '2015-01-01T00:00:00.000Z',
      gender: 'FEMALE',
      isActive: true,
      version: 1,
      updatedAt: '2026-07-01T00:00:00.000Z',
      guardians: [],
    }));
    const updateMock = vi.fn(async (req: { firstName?: string; lastName?: string }) => ({
      id: 's-1',
      institutionId: 'inst-1',
      firstName: req.firstName ?? 'Grace',
      lastName: req.lastName ?? 'Toe',
      fullName: `${req.firstName ?? 'Grace'} ${req.lastName ?? 'Toe'}`,
      admissionNumber: 'ADM-1',
      dateOfBirth: '2015-01-01T00:00:00.000Z',
      gender: 'FEMALE',
      isActive: true,
      version: 2,
      updatedAt: '2026-07-02T00:00:00.000Z',
      guardians: [],
    }));
    (window as unknown as { nemis: unknown }).nemis = {
      student: {
        list: listMock,
        get: getMock,
        update: updateMock,
        getStatistics: vi.fn(async () => ({
          totalStudents: 1,
          maleStudents: 0,
          femaleStudents: 1,
          recentEnrollments: 1,
        })),
      },
      school: { getSummary: vi.fn(async () => null) },
      academicYear: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => []) },
      term: { getCurrent: vi.fn(async () => null) },
      classes: {
        list: vi.fn(async () => ({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 })),
      },
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
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    const firstNameInput = await screen.findByDisplayValue('Grace');
    await user.clear(firstNameInput);
    await user.type(firstNameInput, 'Amara');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ studentId: 's-1', firstName: 'Amara' }),
      ),
    );
    await waitFor(() => expect(screen.queryByText('Edit Student')).toBeNull());
    await waitFor(() => expect(listMock.mock.calls.length).toBeGreaterThan(1));
  });

  it('closes the drawer on Cancel without calling updateStudent', async () => {
    const getMock = vi.fn(async () => ({
      id: 's-1',
      institutionId: 'inst-1',
      firstName: 'Grace',
      lastName: 'Toe',
      fullName: 'Grace Toe',
      admissionNumber: 'ADM-1',
      dateOfBirth: '2015-01-01T00:00:00.000Z',
      gender: 'FEMALE',
      isActive: true,
      version: 1,
      updatedAt: '2026-07-01T00:00:00.000Z',
      guardians: [],
    }));
    const updateMock = vi.fn();
    (window as unknown as { nemis: unknown }).nemis = {
      student: {
        list: vi.fn(async () => ({
          items: [
            {
              id: 's-1',
              fullName: 'Grace Toe',
              admissionNumber: 'ADM-1',
              gradeLevel: 'Grade 1',
              gender: 'Female',
              isActive: true,
              updatedAt: '2026-07-01',
            },
          ],
          total: 1,
          limit: 12,
          offset: 0,
        })),
        get: getMock,
        update: updateMock,
        getStatistics: vi.fn(async () => ({
          totalStudents: 1,
          maleStudents: 0,
          femaleStudents: 1,
          recentEnrollments: 1,
        })),
      },
      school: { getSummary: vi.fn(async () => null) },
      academicYear: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => []) },
      term: { getCurrent: vi.fn(async () => null) },
      classes: {
        list: vi.fn(async () => ({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 })),
      },
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
    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    await screen.findByDisplayValue('Grace');
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    await waitFor(() => expect(screen.queryByText('Edit Student')).toBeNull());
    expect(updateMock).not.toHaveBeenCalled();
  });
});
