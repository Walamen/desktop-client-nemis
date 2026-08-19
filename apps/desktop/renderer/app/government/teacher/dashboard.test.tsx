import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import TeacherDashboardPage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// The signed-in identity (`users.id`) and the id every teaching record is
// keyed by (`staff.id`, backend Assignment.teacherId / TeachingAssignment
// staffId) are different id spaces — the dashboard resolves one from the
// other via the `staff` collection's (unique) `userId` column.
const USER_ID = 'user-1';
const STAFF_ID = 'staff-1';

interface MockNemis {
  teacher: { getDashboard: ReturnType<typeof vi.fn>; listAssignments: ReturnType<typeof vi.fn> };
  student: { list: ReturnType<typeof vi.fn> };
  attendance: { list: ReturnType<typeof vi.fn> };
  schoolAdmin: { list: ReturnType<typeof vi.fn> };
  assignment: { list: ReturnType<typeof vi.fn> };
}

// Shape matches AssignmentResult (packages/types/src/assignments.ts) — the
// "due assignments" widget reads window.nemis.assignment.list directly, not
// the generic schoolAdmin collection (that path never supported this
// entity — see migration 019's doc comment).
function installBaseMock(assignmentRecords: Record<string, unknown>[] = []): MockNemis {
  (window as unknown as { nemis: unknown }).nemis = {
    dashboard: { getOverview: vi.fn(async () => ({ totalStudents: 0, totalClasses: 0, totalSubjects: 0, attendanceToday: { present: 0, total: 0 }, studentsByGrade: [], recentlyEnrolled: [] })) },
    school: { getSummary: vi.fn(async () => null) },
    academicYear: { getCurrent: vi.fn(async () => null) },
    term: { getCurrent: vi.fn(async () => null) },
    identity: { getCurrentUser: vi.fn(async () => ({ id: USER_ID, fullName: 'Jane Doe', email: 'jane@example.com', isActive: true, roles: ['TEACHER'] })) },
    device: { getInfo: vi.fn(async () => null) },
    teacher: {
      getDashboard: vi.fn(async () => ({ totalTeachers: 0, bySubject: [], byGrade: [], byEmploymentStatus: [], recentlyAdded: [], totalAssignments: 0, unassignedTeachers: 0 })),
      listAssignments: vi.fn(async () => []),
    },
    student: { list: vi.fn(async () => ({ items: [], total: 0, limit: 1, offset: 0 })) },
    attendance: { list: vi.fn(async () => []) },
    schoolAdmin: {
      list: vi.fn(async (request: { collection: string }) => {
        if (request.collection === 'staff') {
          return { items: [{ id: STAFF_ID, userId: USER_ID }], total: 1 };
        }
        return { items: [], total: 0 };
      }),
    },
    assignment: { list: vi.fn(async () => assignmentRecords) },
  };
  return (window as unknown as { nemis: MockNemis }).nemis;
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

describe('Teacher dashboard (fresh install)', () => {
  it('renders own-classes stats and honest empty states, never sample numbers', async () => {
    installBaseMock();
    const layer = createRendererPresentation();
    await layer.bootstrap.run();
    render(
      <PresentationProvider layer={layer}>
        <TeacherDashboardPage />
      </PresentationProvider>,
    );
    await waitFor(() => expect(screen.getAllByText('My Classes').length).toBeGreaterThan(0));
    await waitFor(() => expect((window as unknown as { nemis: { teacher: { listAssignments: ReturnType<typeof vi.fn> } } }).nemis.teacher.listAssignments).toHaveBeenCalledWith(STAFF_ID));
    expect(await screen.findByText('No classes assigned yet. Contact your school administrator.')).toBeInTheDocument();
    expect(screen.getByText('No upcoming assignments due.')).toBeInTheDocument();
    expect(screen.queryByText(/^sample$/i)).toBeNull();
  });
});

describe('Teacher dashboard (assigned classes)', () => {
  it('groups assignments by class, sums real enrollment/attendance/assignment data', async () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

    // assignment:list is already self-scoped to the calling teacher
    // server-side (see electron/ipc/handlers/teacher/assignments.ts) — the
    // mock only needs to return this teacher's own rows, matching what the
    // real channel would.
    const nemis = installBaseMock([
      { id: 'hw-1', classId: 'class-1', className: 'Grade 10A', subjectId: 'sub-1', subjectName: 'Mathematics', teacherId: STAFF_ID, title: 'Math Quiz - Chapter 5', type: 'QUIZ', status: 'ACTIVE', dueDate: tomorrow, submittedCount: 0, totalStudents: 25, createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z' },
      { id: 'hw-3', classId: 'class-1', className: 'Grade 10A', subjectId: 'sub-1', subjectName: 'Mathematics', teacherId: STAFF_ID, title: 'Already past due', type: 'QUIZ', status: 'ACTIVE', dueDate: yesterday, submittedCount: 0, totalStudents: 25, createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z' },
    ]);

    nemis.teacher.listAssignments = vi.fn(async () => [
      { id: 'a1', teacherId: STAFF_ID, institutionId: 'inst-1', academicYearId: 'ay-1', academicYearName: '2025/2026', classId: 'class-1', className: 'Grade 10A', gradeLevel: 'GRADE_10', subjectId: 'sub-1', subjectName: 'Mathematics', isClassTeacher: false, assignedAt: '2025-01-01T00:00:00.000Z' },
      { id: 'a2', teacherId: STAFF_ID, institutionId: 'inst-1', academicYearId: 'ay-1', academicYearName: '2025/2026', classId: 'class-1', className: 'Grade 10A', gradeLevel: 'GRADE_10', subjectId: undefined, subjectName: undefined, isClassTeacher: true, assignedAt: '2025-01-01T00:00:00.000Z' },
      { id: 'a3', teacherId: STAFF_ID, institutionId: 'inst-1', academicYearId: 'ay-1', academicYearName: '2025/2026', classId: 'class-2', className: 'Grade 11B', gradeLevel: 'GRADE_11', subjectId: 'sub-2', subjectName: 'Science', isClassTeacher: false, assignedAt: '2025-01-01T00:00:00.000Z' },
    ]);
    nemis.student.list = vi.fn(async (request: { classId: string }) => ({
      items: [], limit: 1, offset: 0, total: request.classId === 'class-1' ? 25 : 18,
    }));
    nemis.attendance.list = vi.fn(async (request: { classId: string }) =>
      request.classId === 'class-1' ? [] : [{ id: 'att-1', studentId: 's1', classId: 'class-2', date: '2026-08-02', status: 'PRESENT', version: 1, updatedAt: '2026-08-02T00:00:00.000Z' }],
    );

    const layer = createRendererPresentation();
    await layer.bootstrap.run();
    render(
      <PresentationProvider layer={layer}>
        <TeacherDashboardPage />
      </PresentationProvider>,
    );

    expect(await screen.findByText('Grade 10A')).toBeInTheDocument();
    expect(screen.getByText('Grade 11B')).toBeInTheDocument();
    expect(screen.getByText('Homeroom')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('43')).toBeInTheDocument()); // 25 + 18 students
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument()); // 1 class pending attendance (class-1)

    expect(await screen.findByText('Math Quiz - Chapter 5')).toBeInTheDocument();
    expect(screen.queryByText('Already past due')).toBeNull();
  });
});
