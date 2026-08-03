import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import TeacherTimetablePage from './page';

// Regression coverage for two bugs teachers hit on this page:
// 1. It called TIMETABLE_TEACHER/TIMETABLE_PERIODS, which authorizeChannel.ts
//    restricted to INSTITUTION_ADMIN — every load errored with a generic
//    "Something went wrong while loading" wall. Fixed by opening both to
//    TEACHER (TIMETABLE_TEACHER self-scoped server-side in timetables.ts,
//    matching TEACHER_LIST_ASSIGNMENTS's pattern; TIMETABLE_PERIODS is
//    institution-wide, non-sensitive bell-schedule data).
// 2. Even routed through the right channel, the page passed the signed-in
//    identity (`users.id`) where a `staffId` was required — the same
//    users.id vs staff.id mismatch documented in government/teacher/page.tsx.
//    `TIMETABLE_TEACHER`'s self-scoping check would reject that mismatched
//    id, so this mock's `staff` collection deliberately uses a DIFFERENT id
//    (STAFF_ID) than the signed-in user's id (USER_ID) — the test fails if
//    the page ever passes USER_ID to timetable.getTeacherSchedule again.
const USER_ID = 'user-1';
const STAFF_ID = 'staff-1';

function installBaseMock() {
  (window as unknown as { nemis: unknown }).nemis = {
    identity: { getCurrentUser: vi.fn(async () => ({ id: USER_ID, fullName: 'Jane Doe', email: 'jane@example.com', isActive: true, roles: ['TEACHER'] })) },
    device: { getInfo: vi.fn(async () => null) },
    school: { getSummary: vi.fn(async () => null) },
    dashboard: { getOverview: vi.fn(async () => ({ totalStudents: 0, totalClasses: 0, totalSubjects: 0, attendanceToday: { present: 0, total: 0 }, studentsByGrade: [], recentlyEnrolled: [] })) },
    academicYear: { getCurrent: vi.fn(async () => null) },
    term: { getCurrent: vi.fn(async () => null) },
    teacher: {
      getDashboard: vi.fn(async () => ({ totalTeachers: 0, bySubject: [], byGrade: [], byEmploymentStatus: [], recentlyAdded: [], totalAssignments: 0, unassignedTeachers: 0 })),
      listAssignments: vi.fn(async (id: string) => (id === STAFF_ID ? [
        { id: 'a1', teacherId: STAFF_ID, institutionId: 'inst-1', academicYearId: 'ay-1', academicYearName: '2025/2026', classId: 'class-1', className: 'Grade 10A', gradeLevel: 'GRADE_10', subjectId: 'sub-1', subjectName: 'Mathematics', isClassTeacher: false, assignedAt: '2025-01-01T00:00:00.000Z' },
      ] : [])),
    },
    student: { list: vi.fn(async () => ({ items: [], total: 0, limit: 1, offset: 0 })) },
    attendance: { list: vi.fn(async () => []) },
    timetable: {
      getTeacherSchedule: vi.fn(async (id: string) => {
        if (id !== STAFF_ID) throw new Error(`[FORBIDDEN] Teachers may only view their own timetable.`);
        return {
          items: [
            { id: 'entry-1', institutionId: 'inst-1', classId: 'class-1', subjectId: 'sub-1', staffId: STAFF_ID, dayOfWeek: 'MONDAY', startTime: '08:00', endTime: '08:45', room: 'Room 4', isBreak: false, createdAt: '2025-01-01T00:00:00.000Z' },
          ],
          total: 1,
        };
      }),
      periods: vi.fn(async () => [
        { startTime: '08:00', endTime: '08:45', isBreak: false, order: 1 },
      ]),
    },
    schoolAdmin: {
      list: vi.fn(async (request: { collection: string }) => {
        if (request.collection === 'staff') {
          return { items: [{ id: STAFF_ID, userId: USER_ID }], total: 1 };
        }
        return { items: [], total: 0 };
      }),
    },
  };
  return (window as unknown as { nemis: { timetable: { getTeacherSchedule: ReturnType<typeof vi.fn>; periods: ReturnType<typeof vi.fn> } } }).nemis;
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

describe('Teacher timetable page', () => {
  it('loads the schedule via the self-scoped staffId, never the raw login id', async () => {
    const nemis = installBaseMock();
    const layer = createRendererPresentation();
    await layer.bootstrap.run();
    render(
      <PresentationProvider layer={layer}>
        <TeacherTimetablePage />
      </PresentationProvider>,
    );

    await waitFor(() => expect(nemis.timetable.getTeacherSchedule).toHaveBeenCalledWith(STAFF_ID));
    expect(nemis.timetable.getTeacherSchedule).not.toHaveBeenCalledWith(USER_ID);
    expect(await screen.findByText('Grade 10A')).toBeInTheDocument();
    expect(screen.getByText('Mathematics')).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).toBeNull();
  });
});
