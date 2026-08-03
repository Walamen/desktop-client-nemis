import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import MySchoolPage from './page';

// Regression coverage for three bugs teachers hit on this page:
// 1. It called TEACHER_LIST/TEACHER_GET_PROFILE and SettingsViewModel/
//    DashboardViewModel's SCHOOL_GET_SUMMARY/DASHBOARD_GET_OVERVIEW —
//    authorizeChannel.ts restricts all of those to INSTITUTION_ADMIN.
// 2. Even after fixing (1) to read the generic `staff` collection, the
//    server restricts `staff` to the signed-in teacher's own row
//    (restrictTeacherSnapshot, desktop-provisioning.service.ts) — so the
//    Staff Directory only ever showed the teacher themselves. Fixed by
//    reading `staff_directory` instead: a separate, minimal, institution-
//    wide projection that is NOT restricted to self.
// 3. The Principal card was derived by scanning staff_directory for
//    position === 'PRINCIPAL' — but "principal" is really whoever holds
//    the INSTITUTION_ADMIN role, a different id space (users.id) from
//    `staff` (staff.id) that often has no `staff` row at all. Fixed by
//    reading `institution_admin` instead, which is deliberately a
//    DIFFERENT identity (Alice Admin) from anyone in staff_directory below.
// `staff` in this mock intentionally returns ONLY the signed-in teacher's
// own row, matching real server behavior — the page must not fall back to
// deriving the directory/principal from it.
const USER_ID = 'user-1';
const STAFF_ID = 'staff-1';
const ADMIN_ID = 'user-admin';

function installBaseMock() {
  (window as unknown as { nemis: unknown }).nemis = {
    dashboard: { getOverview: vi.fn(async () => ({ totalStudents: 12, totalClasses: 3, totalSubjects: 5, attendanceToday: { present: 0, total: 0 }, studentsByGrade: [], recentlyEnrolled: [] })) },
    school: { getSummary: vi.fn(async () => ({ id: 'inst-1', name: 'Monrovia Demonstration School', code: 'MDS-001', type: 'PUBLIC', ownership: 'GOVERNMENT', address: '123 Main St', approvalStatus: 'APPROVED' })) },
    academicYear: { getCurrent: vi.fn(async () => ({ id: 'ay-1', institutionId: 'inst-1', code: '2025/2026', startDate: '2025-09-01', endDate: '2026-06-30', isCurrent: true })) },
    term: { getCurrent: vi.fn(async () => null) },
    identity: { getCurrentUser: vi.fn(async () => ({ id: USER_ID, fullName: 'Jane Doe', email: 'jane@example.com', isActive: true, roles: ['TEACHER'] })) },
    device: { getInfo: vi.fn(async () => null) },
    teacher: {
      getDashboard: vi.fn(async () => ({ totalTeachers: 3, bySubject: [], byGrade: [], byEmploymentStatus: [], recentlyAdded: [], totalAssignments: 0, unassignedTeachers: 0 })),
      listAssignments: vi.fn(async () => [
        { id: 'a1', teacherId: STAFF_ID, institutionId: 'inst-1', academicYearId: 'ay-1', academicYearName: '2025/2026', classId: 'class-1', className: 'Grade 10A', gradeLevel: 'GRADE_10', subjectId: 'sub-1', subjectName: 'Mathematics', isClassTeacher: false, assignedAt: '2025-01-01T00:00:00.000Z' },
      ]),
    },
    student: { list: vi.fn(async () => ({ items: [], total: 0, limit: 1, offset: 0 })) },
    attendance: { list: vi.fn(async () => []) },
    schoolAdmin: {
      list: vi.fn(async (request: { collection: string }) => {
        if (request.collection === 'staff') {
          // Server-restricted: a TEACHER device's `staff` collection only
          // ever contains the signed-in teacher's own row.
          return {
            items: [
              { id: STAFF_ID, userId: USER_ID, firstName: 'Jane', lastName: 'Doe', position: 'TEACHER', isActive: 1, phoneNumber: '0771111111', email: 'jane@example.com', employeeNumber: 'EMP-042' },
            ],
            total: 1,
          };
        }
        if (request.collection === 'staff_directory') {
          // Institution-wide, minimal projection — every teacher device gets
          // the full active roster here regardless of who's signed in. Note:
          // no PRINCIPAL position here — the school's admin account (Alice,
          // below) is a separate identity that may have no `staff` row.
          return {
            items: [
              { id: STAFF_ID, firstName: 'Jane', lastName: 'Doe', position: 'TEACHER', isActive: 1, phoneNumber: '0771111111', email: 'jane@example.com' },
              { id: 'staff-other', firstName: 'Tom', lastName: 'Suah', position: 'TEACHER', isActive: 1, phoneNumber: '0772222222', email: 'tom@example.com' },
            ],
            total: 2,
          };
        }
        if (request.collection === 'institution_admin') {
          return {
            items: [
              { id: ADMIN_ID, firstName: 'Alice', lastName: 'Admin', position: 'PRINCIPAL', isActive: 1, phoneNumber: '0773333333', email: 'alice@example.com' },
            ],
            total: 1,
          };
        }
        if (request.collection === 'institutions') {
          return {
            items: [
              { id: 'inst-1', name: 'Monrovia Demonstration School', code: 'MDS-001', type: 'PUBLIC', ownership: 'GOVERNMENT', street: '123 Main St', communityTown: 'Sinkor', approvalStatus: 'APPROVED' },
            ],
            total: 1,
          };
        }
        if (request.collection === 'students') return { items: [], total: 214 };
        if (request.collection === 'classes') return { items: [], total: 9 };
        return { items: [], total: 0 };
      }),
    },
  };
  return (window as unknown as { nemis: { teacher: Record<string, unknown>; schoolAdmin: { list: ReturnType<typeof vi.fn> } } }).nemis;
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

describe('Teacher "My School" page', () => {
  it('loads school/own profile via the open collections, and the staff directory shows more than just the signed-in teacher', async () => {
    const nemis = installBaseMock();
    const layer = createRendererPresentation();
    await layer.bootstrap.run();
    render(
      <PresentationProvider layer={layer}>
        <MySchoolPage />
      </PresentationProvider>,
    );

    expect(await screen.findByText('Monrovia Demonstration School')).toBeInTheDocument();
    expect(screen.getByText('214')).toBeInTheDocument(); // total students, from the `students` collection total
    expect(screen.getByText('9')).toBeInTheDocument(); // total classes, from the `classes` collection total
    // Principal card: sourced from institution_admin, an identity that
    // appears nowhere in staff_directory or `staff`.
    expect(await screen.findByText('Alice Admin')).toBeInTheDocument();
    expect(screen.getByText('0773333333')).toBeInTheDocument();
    // Staff Directory: includes a colleague who is neither the principal nor the signed-in teacher.
    expect(screen.getByText('Tom Suah')).toBeInTheDocument();
    expect(screen.getByText('EMP-042')).toBeInTheDocument(); // own employee number, from `staff`
    expect(await screen.findByText('Mathematics')).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).toBeNull();
    expect(screen.queryByText('No principal assigned')).toBeNull();

    await waitFor(() => expect(nemis.schoolAdmin.list).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'staff_directory' }),
    ));
    expect(nemis.schoolAdmin.list).toHaveBeenCalledWith(expect.objectContaining({ collection: 'institution_admin' }));
    expect(nemis.schoolAdmin.list).toHaveBeenCalledWith(expect.objectContaining({ collection: 'institutions' }));
    expect(nemis.schoolAdmin.list).toHaveBeenCalledWith(expect.objectContaining({ collection: 'staff' }));
    expect(nemis.schoolAdmin.list).toHaveBeenCalledWith(expect.objectContaining({ collection: 'students' }));
    expect(nemis.schoolAdmin.list).toHaveBeenCalledWith(expect.objectContaining({ collection: 'classes' }));
    expect(nemis.teacher.list).toBeUndefined();
    expect(nemis.teacher.getProfile).toBeUndefined();
  });
});
