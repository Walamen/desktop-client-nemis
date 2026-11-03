import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { StudentProfilePage } from './StudentProfilePage';
import { mockSearch } from '@/test-utils/search-params';
import { Navigator } from '@/test-utils/navigator';

vi.mock('next/navigation', async () => (await import('@/test-utils/search-params')).navigationMock);

beforeEach(() => {
  window.history.pushState({}, '', '/government/school-admin/students/profile?id=s-1');
  mockSearch('id=s-1');
  (window as unknown as { nemis: unknown }).nemis = {
    student: {
      get: vi.fn(async () => ({
        id: 's-1', institutionId: 'inst-1', firstName: 'Grace', lastName: 'Toe', fullName: 'Grace Toe',
        nemisId: '482915736045', dateOfBirth: '2015-01-01T00:00:00.000Z', gender: 'FEMALE', gradeLevel: 'GRADE_1',
        isActive: true, version: 1, updatedAt: '2026-07-01T00:00:00.000Z', guardians: [],
      })),
      listEnrollments: vi.fn(async () => []),
    },
  };
});
afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  window.history.pushState({}, '', '/');
});

describe('StudentProfilePage', () => {
  it('renders the profile header with Grade/Gender/Status badges and fact cards', async () => {
    const layer = createRendererPresentation();
    render(
      <PresentationProvider layer={layer}>
        <StudentProfilePage />
      </PresentationProvider>,
    );
    await waitFor(() => expect(screen.getByText('Grace Toe')).toBeInTheDocument());
    expect(screen.getByText('Personal Information')).toBeInTheDocument();
    expect(screen.getByText('Contact Information')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });
});

describe('StudentProfilePage own address', () => {
  type Nemis = {
    student: { get: ReturnType<typeof vi.fn>; listEnrollments: ReturnType<typeof vi.fn> };
    reportCards?: unknown;
  };
  const nemis = () => (window as unknown as { nemis: Nemis }).nemis;
  const wrap = (ui: React.ReactNode) => (
    <PresentationProvider layer={createRendererPresentation()}>{ui}</PresentationProvider>
  );

  it("loads the student named by its own address, not the previous page's", async () => {
    window.history.pushState({}, '', '/government/school-admin/classes/detail?id=class-1');
    mockSearch('id=stu-1');
    render(wrap(<StudentProfilePage />));
    await waitFor(() => expect(nemis().student.get).toHaveBeenCalledWith('stu-1'));
    expect(nemis().student.get).not.toHaveBeenCalledWith('class-1');
    expect(nemis().student.listEnrollments).not.toHaveBeenCalledWith('class-1');
  });

  const person = (id: string, name: string) => ({
    id, institutionId: 'inst-1', firstName: name, lastName: 'Toe', fullName: name + ' Toe',
    nemisId: '482915736045', dateOfBirth: '2015-01-01T00:00:00.000Z', gender: 'FEMALE', gradeLevel: 'GRADE_1',
    isActive: true, version: 1, updatedAt: '2026-07-01T00:00:00.000Z', guardians: [],
  });
  const enrolment = (id: string, classId: string) => ({
    id, studentId: 'x', academicYearId: 'ay', termId: 'term0001', classId, status: 'ACTIVE',
    enrollmentDate: '2026-09-01T00:00:00.000Z',
  });

  it("follows a changed id: shows the new student and only the new student's enrolments", async () => {
    mockSearch('id=stu-1');
    let releaseB: (rows: unknown[]) => void = () => undefined;
    nemis().student.get.mockImplementation(async (id: string) =>
      id === 'stu-2' ? person('stu-2', 'Second') : person('stu-1', 'First'),
    );
    nemis().student.listEnrollments.mockImplementation((id: string) =>
      id === 'stu-1'
        ? Promise.resolve([enrolment('e-a', 'classAAAA1')])
        : new Promise((r) => { releaseB = r; }),
    );
    render(wrap(<Navigator to="id=stu-2" page={() => <StudentProfilePage />} />));
    expect(await screen.findByText('First Toe')).toBeInTheDocument();
    expect(await screen.findByText('Class classAAA')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(await screen.findByText('Second Toe')).toBeInTheDocument();
    expect(screen.queryByText('First Toe')).toBeNull();
    // B's enrolments are still loading: A's rows must not be on screen.
    expect(screen.queryByText('Class classAAA')).toBeNull();
    releaseB([enrolment('e-b', 'classBBBB1')]);
    expect(await screen.findByText('Class classBBB')).toBeInTheDocument();
    expect(screen.queryByText('Class classAAA')).toBeNull();
  });

  it("never lets a late response for the previous student replace the new student's enrolments", async () => {
    mockSearch('id=stu-1');
    let releaseA: (rows: unknown[]) => void = () => undefined;
    nemis().student.get.mockImplementation(async (id: string) =>
      id === 'stu-2' ? person('stu-2', 'Second') : person('stu-1', 'First'),
    );
    nemis().student.listEnrollments.mockImplementation((id: string) =>
      id === 'stu-1'
        ? new Promise((r) => { releaseA = r; })
        : Promise.resolve([enrolment('e-b', 'classBBBB1')]),
    );
    render(wrap(<Navigator to="id=stu-2" page={() => <StudentProfilePage />} />));
    await waitFor(() => expect(nemis().student.listEnrollments).toHaveBeenCalledWith('stu-1'));
    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(await screen.findByText('Class classBBB')).toBeInTheDocument();
    releaseA([enrolment('e-a', 'classAAAA1')]);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('Class classAAA')).toBeNull();
    expect(screen.getByText('Class classBBB')).toBeInTheDocument();
  });

  it('makes no student or report-card call without an id', async () => {
    window.history.pushState({}, '', '/government/school-admin/students/profile');
    mockSearch('');
    const listForStudent = vi.fn(async () => []);
    nemis().reportCards = { listForStudent };
    const isCreateSynced = vi.fn(async () => ({ synced: true }));
    (nemis().student as Record<string, unknown>).isCreateSynced = isCreateSynced;
    render(wrap(<StudentProfilePage />));
    await new Promise((r) => setTimeout(r, 50));
    expect(isCreateSynced).not.toHaveBeenCalled();
    expect(nemis().student.get).not.toHaveBeenCalled();
    expect(nemis().student.listEnrollments).not.toHaveBeenCalled();
    expect(listForStudent).not.toHaveBeenCalled();
  });
});

describe('StudentProfilePage enrollment/guardians', () => {
  it('shows titled Enrollment History and Guardians cards matching the personal-info card style', async () => {
    window.history.pushState({}, '', '/government/school-admin/students/profile?id=s-1');
    mockSearch('id=s-1');
    (window as unknown as { nemis: unknown }).nemis = {
      student: {
        get: vi.fn(async () => ({
          id: 's-1', institutionId: 'inst-1', firstName: 'Grace', lastName: 'Toe', fullName: 'Grace Toe',
          nemisId: '482915736045', dateOfBirth: '2015-01-01T00:00:00.000Z', gender: 'FEMALE',
          isActive: true, version: 1, updatedAt: '2026-07-01T00:00:00.000Z', guardians: [],
        })),
        listEnrollments: vi.fn(async () => []),
      },
    };
    const layer = createRendererPresentation();
    render(
      <PresentationProvider layer={layer}>
        <StudentProfilePage />
      </PresentationProvider>,
    );
    await waitFor(() => expect(screen.getByText('Grace Toe')).toBeInTheDocument());
    expect(screen.getByText('Enrollment History')).toBeInTheDocument();
    expect(screen.getByText('Guardians')).toBeInTheDocument();
    expect(screen.getByText('No enrollment history available.')).toBeInTheDocument();
    expect(screen.getByText('No guardians assigned.')).toBeInTheDocument();
  });
});

describe('StudentProfilePage student login note', () => {
  function mount(isCreateSynced: () => Promise<{ synced: boolean }>) {
    (window as unknown as { nemis: unknown }).nemis = {
      student: {
        get: vi.fn(async () => ({
          id: 's-1', institutionId: 'inst-1', firstName: 'Grace', lastName: 'Toe', fullName: 'Grace Toe',
          nemisId: '482915736045', dateOfBirth: '2015-01-01T00:00:00.000Z', gender: 'FEMALE',
          isActive: true, version: 1, updatedAt: '2026-07-01T00:00:00.000Z', guardians: [],
        })),
        listEnrollments: vi.fn(async () => []),
        isCreateSynced: vi.fn(isCreateSynced),
      },
    };
    render(
      <PresentationProvider layer={createRendererPresentation()}>
        <StudentProfilePage />
      </PresentationProvider>,
    );
  }

  it('says the student signs in with the formatted NEMIS ID once the create has synced', async () => {
    mount(async () => ({ synced: true }));
    expect(await screen.findByText('Signs in to the student portal with NEMIS ID 4829-1573-6045')).toBeInTheDocument();
    expect(screen.queryByText('Student login becomes available after this record syncs.')).not.toBeInTheDocument();
  });

  it('says the login becomes available after sync while the create is still queued', async () => {
    mount(async () => ({ synced: false }));
    expect(await screen.findByText('Student login becomes available after this record syncs.')).toBeInTheDocument();
    expect(screen.queryByText(/Signs in to the student portal/)).not.toBeInTheDocument();
  });

  it('shows neither note, and does not crash, when the check fails', async () => {
    const isCreateSynced = vi.fn(async () => {
      throw new Error('ipc down');
    });
    mount(isCreateSynced);
    await waitFor(() => expect(screen.getByText('Grace Toe')).toBeInTheDocument());
    await waitFor(() => expect(isCreateSynced).toHaveBeenCalled());
    expect(screen.queryByText(/Signs in to the student portal/)).not.toBeInTheDocument();
    expect(screen.queryByText('Student login becomes available after this record syncs.')).not.toBeInTheDocument();
  });
});

describe('StudentProfilePage report cards', () => {
  it('shows a Report cards section listing the issued cards', async () => {
    const nemis = (window as unknown as { nemis: Record<string, unknown> }).nemis;
    nemis.reportCards = {
      listForStudent: vi.fn(async () => [
        {
          issueId: 'i-1', reportCardId: 'rc-1', studentId: 's-1', academicYearId: 'ay-1', academicYearName: '2026/2027',
          classId: 'c-1', className: 'Grade 1A', kind: 'PERIOD', gradingPeriodName: 'Period 1', version: 1,
          status: 'CURRENT', issuedAt: '2026-10-01T10:00:00.000Z',
        },
      ]),
    };
    const layer = createRendererPresentation();
    render(
      <PresentationProvider layer={layer}>
        <StudentProfilePage />
      </PresentationProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Report cards' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: '2026/2027' })).toBeInTheDocument();
  });
});
