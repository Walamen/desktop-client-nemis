import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import ClassDetailPage from './page';

// Regression coverage: this page passed the signed-in identity (`users.id`)
// straight to TEACHER_LIST_ASSIGNMENTS, which requires the caller's
// `staff.id` — the same users.id vs staff.id mismatch documented in
// government/teacher/page.tsx and already fixed once on the Timetable page
// (see government/teacher/timetable/timetable.test.tsx). This mock's `staff`
// collection deliberately uses a DIFFERENT id (STAFF_ID) than the signed-in
// user's id (USER_ID) — the test fails if the page ever passes USER_ID to
// teacher.listAssignments again.
const USER_ID = 'user-1';
const STAFF_ID = 'staff-1';

function installBaseMock() {
  (window as unknown as { nemis: unknown }).nemis = {
    identity: { getCurrentUser: vi.fn(async () => ({ id: USER_ID, fullName: 'Jane Doe', email: 'jane@example.com', isActive: true, roles: ['TEACHER'] })) },
    device: { getInfo: vi.fn(async () => null) },
    school: { getSummary: vi.fn(async () => null) },
    dashboard: { getOverview: vi.fn(async () => null) },
    academicYear: { getCurrent: vi.fn(async () => null) },
    term: { getCurrent: vi.fn(async () => null) },
    teacher: {
      getDashboard: vi.fn(async () => ({ totalTeachers: 0, bySubject: [], byGrade: [], byEmploymentStatus: [], recentlyAdded: [], totalAssignments: 0, unassignedTeachers: 0 })),
      listAssignments: vi.fn(async (id: string) => {
        if (id !== STAFF_ID) throw new Error('[FORBIDDEN] Teachers may only view their own teaching assignments.');
        return [
          { id: 'a1', teacherId: STAFF_ID, institutionId: 'inst-1', academicYearId: 'ay-1', academicYearName: '2025/2026', classId: 'class-1', className: 'Grade 10A', gradeLevel: 'GRADE_10', subjectId: 'sub-1', subjectName: 'Mathematics', isClassTeacher: false, assignedAt: '2025-01-01T00:00:00.000Z' },
        ];
      }),
    },
    student: { list: vi.fn(async () => ({ items: [], total: 0, limit: 200, offset: 0 })) },
    attendance: { list: vi.fn(async () => []) },
    schoolAdmin: {
      list: vi.fn(async (request: { collection: string }) => {
        if (request.collection === 'staff') {
          return { items: [{ id: STAFF_ID, userId: USER_ID }], total: 1 };
        }
        return { items: [], total: 0 };
      }),
    },
  };
  return (window as unknown as { nemis: { teacher: { listAssignments: ReturnType<typeof vi.fn> } } }).nemis;
}

beforeEach(() => {
  window.history.replaceState({}, '', '/government/teacher/my-classes/classes/detail?id=class-1');
});

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

describe('Teacher class detail page', () => {
  it('loads teaching assignments via the self-scoped staffId, never the raw login id', async () => {
    const nemis = installBaseMock();
    const layer = createRendererPresentation();
    await layer.bootstrap.run();
    render(
      <PresentationProvider layer={layer}>
        <ClassDetailPage />
      </PresentationProvider>,
    );

    await waitFor(() => expect(nemis.teacher.listAssignments).toHaveBeenCalledWith(STAFF_ID));
    expect(nemis.teacher.listAssignments).not.toHaveBeenCalledWith(USER_ID);
    expect(await screen.findByText('Grade 10A')).toBeInTheDocument();
    expect(screen.queryByText('Class not found')).toBeNull();
  });
});
