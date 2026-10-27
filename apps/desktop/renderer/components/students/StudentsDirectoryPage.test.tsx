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
    await user.type(screen.getByPlaceholderText('Name or NEMIS ID'), 'Grace');
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
              nemisId: '482915736045',
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
              nemisId: '482915736045',
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
      nemisId: '482915736045',
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
              nemisId: '482915736045',
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
          nemisId: '482915736045',
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
      nemisId: '482915736045',
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
      nemisId: '482915736045',
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
      nemisId: '482915736045',
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
              nemisId: '482915736045',
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

describe('StudentsDirectoryPage enrolment view', () => {
  const row = {
    id: 's-9',
    fullName: 'Mary Kollie',
    nemisId: '482915736045',
    gradeLevel: 'Grade 1',
    gender: 'Female',
    isActive: true,
    updatedAt: '2026-07-01',
    dateOfBirth: '2015-03-09',
  };
  function stubWith(year: unknown, rows: unknown[] = [row]) {
    const listMock = vi.fn(async () => ({ items: rows, total: rows.length, limit: 12, offset: 0 }));
    (window as unknown as { nemis: unknown }).nemis = {
      student: {
        list: listMock,
        getStatistics: vi.fn(async () => ({ totalStudents: 1, maleStudents: 0, femaleStudents: 1, recentEnrollments: 0 })),
      },
      school: { getSummary: vi.fn(async () => null) },
      academicYear: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => (year ? [year] : [])) },
      term: { getCurrent: vi.fn(async () => null) },
      classes: { list: vi.fn(async () => ({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 })) },
    };
    return listMock;
  }
  const activeYear = {
    id: 'y1', institutionId: 'inst-1', code: '2026/2027', startDate: '2026-09-01', endDate: '2027-06-30',
    isCurrent: true, status: 'ACTIVE',
  };
  const renderPage = () =>
    render(
      <PresentationProvider layer={createRendererPresentation()}>
        <StudentsDirectoryPage />
      </PresentationProvider>,
    );

  it('shows both tabs, defaults to the enrolled view, and asks the list for it', async () => {
    const listMock = stubWith(activeYear);
    renderPage();
    expect(await screen.findByRole('button', { name: 'Enrolled for 2026/2027' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not enrolled for 2026/2027' })).toBeInTheDocument();
    await waitFor(() =>
      expect(listMock.mock.calls.some((c) => (c as unknown[])[0] && (c as unknown as [{ enrolment?: string }])[0].enrolment === 'current')).toBe(true),
    );
  });

  it('the not-enrolled tab refetches with not-current and links each row into the lookup', async () => {
    const listMock = stubWith(activeYear);
    renderPage();
    const { default: userEvent } = await import('@testing-library/user-event');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Not enrolled for 2026/2027' }));
    await waitFor(() =>
      expect((listMock.mock.calls.at(-1) as unknown[] | undefined)?.[0]).toMatchObject({ enrolment: 'not-current' }),
    );
    const link = await screen.findByRole('link', { name: 'Enrol for 2026/2027' });
    expect(link.getAttribute('href')).toBe(
      '/government/school-admin/students/create?nemisId=482915736045&dob=2015-03-09',
    );
  });

  it('hides the action for a student without a NEMIS ID', async () => {
    stubWith(activeYear, [{ ...row, nemisId: undefined }]);
    renderPage();
    const { default: userEvent } = await import('@testing-library/user-event');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Not enrolled for 2026/2027' }));
    await screen.findByText('Mary Kollie');
    expect(screen.queryByRole('link', { name: 'Enrol for 2026/2027' })).toBeNull();
  });

  it('shows no tabs and does not filter when the current year is not ACTIVE', async () => {
    const listMock = stubWith({ ...activeYear, status: 'REOPENED' });
    renderPage();
    await screen.findByText('Mary Kollie');
    expect(screen.queryByRole('button', { name: /Not enrolled for/ })).toBeNull();
    for (const call of listMock.mock.calls) expect((call as unknown[])[0]).not.toHaveProperty('enrolment');
  });

  it('the grid card carries the same Enrol link', async () => {
    stubWith(activeYear);
    renderPage();
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Not enrolled for 2026/2027' }));
    await user.click(screen.getByRole('button', { name: /grid view/i }));
    expect(screen.queryByRole('table')).toBeNull();
    const link = await screen.findByRole('link', { name: 'Enrol for 2026/2027' });
    expect(link.getAttribute('href')).toBe('/government/school-admin/students/create?nemisId=482915736045&dob=2015-03-09');
  });

  it('shows no tabs and no action when the school has no active year', async () => {
    const listMock = stubWith(null);
    renderPage();
    await screen.findByText('Mary Kollie');
    expect(listMock.mock.calls.length).toBeGreaterThan(0);
    for (const call of listMock.mock.calls) expect((call as unknown[])[0]).not.toHaveProperty('enrolment');
    expect(screen.queryByRole('button', { name: /Not enrolled for/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Enrol for/ })).toBeNull();
  });
});
