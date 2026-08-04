import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import TeacherGradesPage from './page';

// The page now calls useRouter() (Assessment Setup empty-state link), which
// throws "invariant expected app router to be mounted" outside a real Next.js
// app router context — same mock pattern as Header.test.tsx/Sidebar.test.tsx.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Regression coverage for the same category of bugs found on the sibling
// My School and Timetable pages:
// 1. It passed the signed-in login id (`users.id`) to
//    TEACHER_LIST_ASSIGNMENTS, which self-scopes against the caller's real
//    `staff.id` — a mismatch throws Forbidden and blocks the whole page.
//    This mock's `staff` collection deliberately uses a DIFFERENT id
//    (STAFF_ID) than the signed-in user's id (USER_ID).
// 2. ACADEMIC_YEAR_GET_CURRENT and TERM_LIST were restricted to
//    INSTITUTION_ADMIN in authorizeChannel.ts, even though the term
//    selector needs both — teachers got ForbiddenError.
// 3. `institution_grading_configs` (the letter-grade scale) wasn't in
//    TEACHER's read-collection allowlist in SchoolAdminModuleService.
const USER_ID = 'user-1';
const STAFF_ID = 'staff-1';

function installBaseMock() {
  const assessmentInstances: Record<string, unknown>[] = [];
  const gradeRows: Record<string, unknown>[] = [];

  (window as unknown as { nemis: unknown }).nemis = {
    identity: { getCurrentUser: vi.fn(async () => ({ id: USER_ID, fullName: 'Jane Doe', email: 'jane@example.com', isActive: true, roles: ['TEACHER'] })) },
    device: { getInfo: vi.fn(async () => null) },
    school: { getSummary: vi.fn(async () => null) },
    dashboard: { getOverview: vi.fn(async () => ({ totalStudents: 0, totalClasses: 0, totalSubjects: 0, attendanceToday: { present: 0, total: 0 }, studentsByGrade: [], recentlyEnrolled: [] })) },
    academicYear: { getCurrent: vi.fn(async () => ({ id: 'ay-1', institutionId: 'inst-1', code: '2025/2026', startDate: '2025-09-01', endDate: '2026-06-30', isCurrent: true })) },
    term: {
      getCurrent: vi.fn(async () => null),
      list: vi.fn(async (academicYearId: string) => (academicYearId === 'ay-1' ? [
        { id: 'term-1', academicYearId: 'ay-1', name: 'Term 1', startDate: '2025-09-01', endDate: '2025-12-15', isCurrent: true },
      ] : [])),
    },
    teacher: {
      getDashboard: vi.fn(async () => ({ totalTeachers: 0, bySubject: [], byGrade: [], byEmploymentStatus: [], recentlyAdded: [], totalAssignments: 0, unassignedTeachers: 0 })),
      listAssignments: vi.fn(async (id: string) => (id === STAFF_ID ? [
        { id: 'a1', teacherId: STAFF_ID, institutionId: 'inst-1', academicYearId: 'ay-1', academicYearName: '2025/2026', classId: 'class-1', className: 'Grade 10A', gradeLevel: 'GRADE_10', subjectId: 'sub-1', subjectName: 'Mathematics', isClassTeacher: false, assignedAt: '2025-01-01T00:00:00.000Z' },
      ] : [])),
    },
    student: {
      list: vi.fn(async () => ({
        items: [
          { id: 'student-1', fullName: 'Alice Johnson', admissionNumber: 'ADM-001', gradeLevel: 'GRADE_10', gender: 'FEMALE', isActive: true },
        ],
        total: 1,
        limit: 100,
        offset: 0,
      })),
    },
    attendance: { list: vi.fn(async () => []) },
    schoolAdmin: {
      list: vi.fn(async (request: { collection: string }) => {
        if (request.collection === 'staff') return { items: [{ id: STAFF_ID, userId: USER_ID }], total: 1 };
        if (request.collection === 'grading_periods') return { items: [{ id: 'period-1', termId: 'term-1', name: 'Period 1', periodType: 'REGULAR_PERIOD', maxMarks: 100, isActive: 1 }], total: 1 };
        if (request.collection === 'grade_entry_windows') return { items: [{ id: 'window-1', gradingPeriodId: 'period-1', status: 'OPEN' }], total: 1 };
        if (request.collection === 'institution_grading_configs') return { items: [{ id: 'config-1', gradeScale: JSON.stringify([{ letter: 'A', description: 'Excellent', min: 80, max: 100, gradePoint: 4 }]) }], total: 1 };
        if (request.collection === 'assessment_templates') return { items: [{ id: 'template-1', classId: 'class-1', subjectId: 'sub-1', name: 'Quiz 1', type: 'QUIZ', totalMarks: 20, weight: 100, date: '2025-09-15' }], total: 1 };
        if (request.collection === 'assessments') return { items: assessmentInstances, total: assessmentInstances.length };
        if (request.collection === 'grades') return { items: gradeRows, total: gradeRows.length };
        return { items: [], total: 0 };
      }),
      save: vi.fn(async (request: { collection: string; record: Record<string, unknown> }) => {
        if (request.collection === 'assessments') {
          const created = { id: `assessment-${assessmentInstances.length + 1}`, ...request.record };
          assessmentInstances.push(created);
          return created;
        }
        // Mirrors SchoolAdminModuleService.save()'s real merge-on-write
        // behavior (fetch existing row, spread the patch on top) so that the
        // partial-record saves used by publish/unpublish (`{ id, isPublished,
        // status, publishedAt }` only) don't silently wipe the rest of the
        // row the way a naive full-object replace would.
        const id = request.record.id ?? `grade-${gradeRows.length + 1}`;
        const idx = gradeRows.findIndex((g) => g.id === id);
        const existing = idx >= 0 ? gradeRows[idx] : undefined;
        const created = { ...(existing ?? {}), ...request.record, id };
        if (idx >= 0) gradeRows[idx] = created; else gradeRows.push(created);
        return created;
      }),
      delete: vi.fn(async (request: { id: string }) => {
        const idx = gradeRows.findIndex((g) => g.id === request.id);
        if (idx >= 0) gradeRows.splice(idx, 1);
        return { id: request.id };
      }),
    },
  };
  return (window as unknown as {
    nemis: {
      teacher: { listAssignments: ReturnType<typeof vi.fn> };
      academicYear: { getCurrent: ReturnType<typeof vi.fn> };
      term: { list: ReturnType<typeof vi.fn> };
      schoolAdmin: { list: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
    };
  }).nemis;
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

describe('Teacher grades page', () => {
  it('loads own classes, the current term, and the grading config via the self-scoped/open channels', async () => {
    const nemis = installBaseMock();
    const layer = createRendererPresentation();
    await layer.bootstrap.run();
    render(
      <PresentationProvider layer={layer}>
        <TeacherGradesPage />
      </PresentationProvider>,
    );

    await waitFor(() => expect(nemis.teacher.listAssignments).toHaveBeenCalledWith(STAFF_ID));
    expect(nemis.teacher.listAssignments).not.toHaveBeenCalledWith(USER_ID);
    await waitFor(() => expect(nemis.term.list).toHaveBeenCalledWith('ay-1'));
    await waitFor(() => expect(nemis.schoolAdmin.list).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'institution_grading_configs' }),
    ));

    expect(await screen.findByText('Grade 10A')).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).toBeNull();

    // Subject and grading period have no auto-select — pick them like a user
    // would. The selects have no accessible label wiring yet, so target them
    // by DOM order (Term, Class, Subject, Period) instead.
    const [, , subjectSelect, periodSelect] = screen.getAllByRole('combobox');
    fireEvent.change(subjectSelect!, { target: { value: 'sub-1' } });
    fireEvent.change(periodSelect!, { target: { value: 'period-1' } });

    expect(await screen.findByText('Alice Johnson')).toBeInTheDocument();

    expect(await screen.findByText('Quiz 1')).toBeInTheDocument(); // template column header
    const scoreInput = screen.getAllByRole('spinbutton')[0]!;
    fireEvent.change(scoreInput, { target: { value: '18' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(nemis.schoolAdmin.save).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'assessments', record: expect.objectContaining({ templateId: 'template-1', gradingPeriodId: 'period-1' }) }),
    ));
    await waitFor(() => expect(nemis.schoolAdmin.save).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'grades', record: expect.objectContaining({ marksObtained: 18, assessmentId: 'assessment-1' }) }),
    ));
  });

  it('publishes scores to students, then allows unlocking them again', async () => {
    const nemis = installBaseMock();
    const layer = createRendererPresentation();
    await layer.bootstrap.run();
    render(<PresentationProvider layer={layer}><TeacherGradesPage /></PresentationProvider>);

    // Wait for the class/term auto-selects (and the periods they unlock) to
    // settle before touching subject/period — otherwise fireEvent.change on
    // a <select> with no matching <option> yet resets to '' instead of
    // sticking, same race test 1 above avoids via its earlier waitFor calls.
    await waitFor(() => expect(nemis.term.list).toHaveBeenCalledWith('ay-1'));
    await screen.findByText('Grade 10A');

    const [, , subjectSelect, periodSelect] = screen.getAllByRole('combobox');
    fireEvent.change(subjectSelect!, { target: { value: 'sub-1' } });
    fireEvent.change(periodSelect!, { target: { value: 'period-1' } });
    await screen.findByText('Quiz 1');
    fireEvent.change(screen.getAllByRole('spinbutton')[0]!, { target: { value: '18' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(nemis.schoolAdmin.save).toHaveBeenCalledWith(expect.objectContaining({ collection: 'grades' })));

    fireEvent.click(await screen.findByText('Send to Students'));
    await waitFor(() => expect(screen.getByText('Update Grades')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Update Grades'));
    await waitFor(() => expect(screen.getByText('Send to Students')).toBeInTheDocument());
  });

  it('publishes a score entered just before clicking Send to Students, with no separate manual Save first', async () => {
    // Regression test: handleSendToStudents' internal
    // `if (hasUnsaved) await persistTemplateScores()` can create a
    // brand-new `grades` row (first score ever entered for this
    // student/template pair — no prior row to have been captured in the
    // component's `grades` state/closure). The publish step must read
    // freshly from storage rather than the stale pre-persist `grades`
    // closure, or this newly-created row is silently skipped.
    const nemis = installBaseMock();
    const layer = createRendererPresentation();
    await layer.bootstrap.run();
    render(<PresentationProvider layer={layer}><TeacherGradesPage /></PresentationProvider>);

    await waitFor(() => expect(nemis.term.list).toHaveBeenCalledWith('ay-1'));
    await screen.findByText('Grade 10A');

    const [, , subjectSelect, periodSelect] = screen.getAllByRole('combobox');
    fireEvent.change(subjectSelect!, { target: { value: 'sub-1' } });
    fireEvent.change(periodSelect!, { target: { value: 'period-1' } });
    await screen.findByText('Quiz 1');

    // No prior grade row exists for this student/template yet. Enter a
    // score and go straight to "Send to Students" — deliberately skipping
    // a manual "Save" click — so the implicit persistTemplateScores() call
    // inside handleSendToStudents is what creates the row for the first
    // time.
    fireEvent.change(screen.getAllByRole('spinbutton')[0]!, { target: { value: '18' } });
    fireEvent.click(await screen.findByText('Send to Students'));

    await waitFor(() => expect(nemis.schoolAdmin.save).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'grades',
        record: expect.objectContaining({ isPublished: true, status: 'PUBLISHED' }),
      }),
    ));
    // If the newly-created row had been skipped (stale-closure bug), no
    // grade for this period would be published and the row would stay
    // published:false — the button row would still show "Send to
    // Students" instead of switching to "Update Grades".
    await waitFor(() => expect(screen.getByText('Update Grades')).toBeInTheDocument());
  });

  it('shows Summary & Submit readiness and submits ready subjects', async () => {
    const nemis = installBaseMock();
    const layer = createRendererPresentation();
    await layer.bootstrap.run();
    render(<PresentationProvider layer={layer}><TeacherGradesPage /></PresentationProvider>);

    // Wait for the class/term auto-selects (and the periods they unlock) to
    // settle before touching subject/period — same race test 2/3 above avoid
    // via this same waitFor pair (a <select> fireEvent.change with no
    // matching <option> yet resets to '' instead of sticking).
    await waitFor(() => expect(nemis.term.list).toHaveBeenCalledWith('ay-1'));
    await screen.findByText('Grade 10A');

    const [, , subjectSelect, periodSelect] = screen.getAllByRole('combobox');
    fireEvent.change(subjectSelect!, { target: { value: 'sub-1' } });
    fireEvent.change(periodSelect!, { target: { value: 'period-1' } });
    await screen.findByText('Quiz 1');
    fireEvent.change(screen.getAllByRole('spinbutton')[0]!, { target: { value: '18' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(nemis.schoolAdmin.save).toHaveBeenCalledWith(expect.objectContaining({ collection: 'grades' })));

    fireEvent.click(screen.getByText('Summary & Submit'));
    expect(await screen.findByText('Mathematics')).toBeInTheDocument();
    expect(await screen.findByText('Ready')).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Submit All Ready Subjects/));
    await waitFor(() => expect(nemis.schoolAdmin.save).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'grades', record: expect.objectContaining({ assessmentId: null, status: 'SUBMITTED' }) }),
    ));
  });
});
