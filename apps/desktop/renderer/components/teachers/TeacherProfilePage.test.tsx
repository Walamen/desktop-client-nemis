import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { mockSearch } from '@/test-utils/search-params';
import { Navigator } from '@/test-utils/navigator';
import { TeacherProfilePage } from './TeacherProfilePage';

vi.mock('next/navigation', async () => (await import('@/test-utils/search-params')).navigationMock);

const person = (id: string, name: string) => ({
  id, institutionId: 'inst-1', firstName: name, lastName: 'Teacher', dateOfBirth: '1990-01-01T00:00:00.000Z',
  gender: 'FEMALE', phoneNumber: '0770000000', employeeNumber: `E-${id}`, position: 'TEACHER',
  employmentType: 'FULL_TIME', dateOfJoining: '2020-01-01T00:00:00.000Z', isActive: true,
  approvalStatus: 'APPROVED', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z', assignments: [],
});
const assignment = (teacherId: string, className: string) => ({
  id: `as-${teacherId}`, teacherId, institutionId: 'inst-1', academicYearId: 'ay-1', academicYearName: '2026',
  classId: `c-${teacherId}`, className, gradeLevel: 'GRADE_1', subjectId: 'sub-1', subjectName: 'Maths',
  isClassTeacher: false, assignedAt: '2026-01-01T00:00:00.000Z',
});

type Nemis = { teacher: { getProfile: ReturnType<typeof vi.fn>; listAssignments: ReturnType<typeof vi.fn> } };
const nemis = () => (window as unknown as { nemis: Nemis }).nemis;
const wrap = (ui: React.ReactNode) => <PresentationProvider layer={createRendererPresentation()}>{ui}</PresentationProvider>;

beforeEach(() => {
  mockSearch('id=t-1');
  window.history.pushState({}, '', '/government/school-admin/teachers-staff/profile?id=t-1');
  (window as unknown as { nemis: unknown }).nemis = {
    teacher: {
      getProfile: vi.fn(async (id: string) => (id === 't-2' ? person('t-2', 'Second') : person('t-1', 'First'))),
      listAssignments: vi.fn(async (id: string) => [assignment(id, id === 't-2' ? 'Beta Room' : 'Alpha Room')]),
    },
    classes: { list: vi.fn(async () => ({ items: [], total: 0, limit: 25, offset: 0 })) },
    subject: { list: vi.fn(async () => ({ items: [], total: 0, limit: 25, offset: 0 })) },
  };
});
afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  window.history.pushState({}, '', '/');
});

describe('TeacherProfilePage own address', () => {
  it("loads the teacher named by its own address, not the previous page's", async () => {
    window.history.pushState({}, '', '/government/school-admin/teachers-staff?id=stale');
    mockSearch('id=t-2');
    render(wrap(<TeacherProfilePage />));
    await waitFor(() => expect(nemis().teacher.getProfile).toHaveBeenCalledWith('t-2'));
    expect(nemis().teacher.getProfile).not.toHaveBeenCalledWith('stale');
    expect(nemis().teacher.listAssignments).not.toHaveBeenCalledWith('stale');
    expect(await screen.findByText('Second Teacher')).toBeInTheDocument();
  });

  it("follows a changed id: shows the new teacher and only the new teacher's assignments", async () => {
    let releaseB: (rows: unknown[]) => void = () => undefined;
    nemis().teacher.listAssignments.mockImplementation((id: string) =>
      id === 't-1' ? Promise.resolve([assignment('t-1', 'Alpha Room')]) : new Promise((r) => { releaseB = r; }),
    );
    render(wrap(<Navigator to="id=t-2" page={() => <TeacherProfilePage />} />));
    expect(await screen.findByText('First Teacher')).toBeInTheDocument();
    expect(await screen.findByText('Alpha Room')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(await screen.findByText('Second Teacher')).toBeInTheDocument();
    expect(screen.queryByText('First Teacher')).toBeNull();
    // B's assignments are still loading: A's rows must not be on screen.
    expect(screen.queryByText('Alpha Room')).toBeNull();
    releaseB([assignment('t-2', 'Beta Room')]);
    expect(await screen.findByText('Beta Room')).toBeInTheDocument();
    expect(screen.queryByText('Alpha Room')).toBeNull();
  });

  it('makes no teacher call without an id', async () => {
    window.history.pushState({}, '', '/government/school-admin/teachers-staff/profile');
    mockSearch('');
    render(wrap(<TeacherProfilePage />));
    await new Promise((r) => setTimeout(r, 50));
    expect(nemis().teacher.getProfile).not.toHaveBeenCalled();
    expect(nemis().teacher.listAssignments).not.toHaveBeenCalled();
  });
});
