import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import AssessmentSetupPage from './page';

const USER_ID = 'user-1';
const STAFF_ID = 'staff-1';

function installBaseMock() {
  const templates: Record<string, unknown>[] = [];
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
        { id: 'a2', teacherId: STAFF_ID, institutionId: 'inst-1', academicYearId: 'ay-1', academicYearName: '2025/2026', classId: 'class-1', className: 'Grade 10A', gradeLevel: 'GRADE_10', subjectId: 'sub-2', subjectName: 'Science', isClassTeacher: false, assignedAt: '2025-01-01T00:00:00.000Z' },
      ] : [])),
    },
    student: { list: vi.fn(async () => ({ items: [], total: 0, limit: 1, offset: 0 })) },
    attendance: { list: vi.fn(async () => []) },
    schoolAdmin: {
      list: vi.fn(async (request: { collection: string }) => {
        if (request.collection === 'staff') return { items: [{ id: STAFF_ID, userId: USER_ID }], total: 1 };
        if (request.collection === 'assessment_templates') return { items: templates, total: templates.length };
        return { items: [], total: 0 };
      }),
      save: vi.fn(async (request: { collection: string; record: Record<string, unknown> }) => {
        const record = { id: request.record.id ?? `template-${templates.length + 1}`, ...request.record };
        const existingIndex = templates.findIndex((t) => t.id === record.id);
        if (existingIndex >= 0) templates[existingIndex] = record;
        else templates.push(record);
        return record;
      }),
      delete: vi.fn(async (request: { id: string }) => {
        const index = templates.findIndex((t) => t.id === request.id);
        if (index >= 0) templates.splice(index, 1);
        return { id: request.id };
      }),
    },
  };
  return (window as unknown as { nemis: { schoolAdmin: { save: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> } } }).nemis;
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

describe('Assessment Setup page', () => {
  it('creates, edits, and deletes a template for the selected class/subject', async () => {
    const nemis = installBaseMock();
    const layer = createRendererPresentation();
    await layer.bootstrap.run();
    render(
      <PresentationProvider layer={layer}>
        <AssessmentSetupPage />
      </PresentationProvider>,
    );

    // Wait for the teaching-assignments load to populate the class <option>
    // before selecting it — selecting a value with no matching <option> yet
    // is a silent no-op in jsdom.
    expect(await screen.findByText('Grade 10A')).toBeInTheDocument();
    const [classSelect, subjectSelect] = screen.getAllByRole('combobox');
    fireEvent.change(classSelect!, { target: { value: 'class-1' } });
    fireEvent.change(subjectSelect!, { target: { value: 'sub-1' } });

    // "Add Assessment" now opens the bulk-create table (Task 9) — a single
    // empty row by default — rather than the single-record form, which is
    // reserved for editing an existing template.
    fireEvent.click(await screen.findByText('Add Assessment'));
    fireEvent.change(screen.getByPlaceholderText('Quiz 1'), { target: { value: 'Quiz 1' } });
    fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '20' } });
    fireEvent.click(screen.getByText('Create 1 Assessment'));

    await waitFor(() => expect(nemis.schoolAdmin.save).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'assessment_templates', record: expect.objectContaining({ name: 'Quiz 1', classId: 'class-1', subjectId: 'sub-1' }) }),
    ));
    expect(await screen.findByText('Quiz 1')).toBeInTheDocument();

    // Click the row's Edit button (first of the two icon-only buttons
    // rendered next to the template) and verify handleEdit's effect: the
    // drawer reopens pre-populated with the existing template's values.
    // The plain-text/role queries from the brief are too brittle here (the
    // Edit/Delete buttons carry no accessible name), so we locate them via
    // the row's own DOM structure instead.
    const templateRow = screen.getByText('Quiz 1').closest('div.flex.items-start')!;
    const rowButtons = templateRow.querySelectorAll('button');
    expect(rowButtons.length).toBe(2);
    fireEvent.click(rowButtons[0]!);

    await waitFor(() => expect(screen.getByDisplayValue('Quiz 1')).toBeInTheDocument());
    expect(screen.getByText('Update Assessment')).toBeInTheDocument();

    // Delete the template and wait for the post-delete reload to finish
    // (not just the delete call itself) so no in-flight bridge call is left
    // pending once the test unmounts and the mock is torn down.
    fireEvent.click(rowButtons[1]!);
    await waitFor(() => expect(nemis.schoolAdmin.delete).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'assessment_templates' }),
    ));
    expect(await screen.findByText('No assessments found.')).toBeInTheDocument();
  });

  it('surfaces feedback instead of an unhandled rejection when deleting a template fails', async () => {
    // Mirrors the local SQLite FK (assessments.templateId REFERENCES
    // assessment_templates(id), foreign_keys=ON, no cascade) rejecting a
    // delete for a template that already has recorded assessments — the
    // desktop equivalent of the backend's conflict() guard. Before the fix,
    // handleDelete had no try/catch at all, so this rejection would surface
    // as an unhandled promise rejection with zero user-visible explanation.
    const nemis = installBaseMock();
    const layer = createRendererPresentation();
    await layer.bootstrap.run();
    render(
      <PresentationProvider layer={layer}>
        <AssessmentSetupPage />
      </PresentationProvider>,
    );

    expect(await screen.findByText('Grade 10A')).toBeInTheDocument();
    const [classSelect, subjectSelect] = screen.getAllByRole('combobox');
    fireEvent.change(classSelect!, { target: { value: 'class-1' } });
    fireEvent.change(subjectSelect!, { target: { value: 'sub-1' } });

    fireEvent.click(await screen.findByText('Add Assessment'));
    fireEvent.change(screen.getByPlaceholderText('Quiz 1'), { target: { value: 'Quiz 1' } });
    fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '20' } });
    fireEvent.click(screen.getByText('Create 1 Assessment'));
    await screen.findByText('Quiz 1');

    nemis.schoolAdmin.delete.mockRejectedValueOnce(new Error('[UNEXPECTED_ERROR] An unexpected error occurred.'));

    const templateRow = screen.getByText('Quiz 1').closest('div.flex.items-start')!;
    const rowButtons = templateRow.querySelectorAll('button');
    fireEvent.click(rowButtons[1]!);

    await waitFor(() => expect(nemis.schoolAdmin.delete).toHaveBeenCalled());
    expect(await screen.findByText(/Failed to delete assessment/)).toBeInTheDocument();
    // The row must still be there — the delete never actually happened, and
    // reloadToken was never bumped for it.
    expect(screen.getByText('Quiz 1')).toBeInTheDocument();
  });

  it('bulk-creates multiple templates in one submission', async () => {
    const nemis = installBaseMock();
    const layer = createRendererPresentation();
    await layer.bootstrap.run();
    render(
      <PresentationProvider layer={layer}>
        <AssessmentSetupPage />
      </PresentationProvider>,
    );

    // Wait for the teaching-assignments load to populate the class <option>
    // before selecting it — selecting a value with no matching <option> yet
    // is a silent no-op in jsdom (same precedent as the test above).
    expect(await screen.findByText('Grade 10A')).toBeInTheDocument();
    const [classSelect, subjectSelect] = screen.getAllByRole('combobox');
    fireEvent.change(classSelect!, { target: { value: 'class-1' } });
    fireEvent.change(subjectSelect!, { target: { value: 'sub-1' } });
    fireEvent.click(await screen.findByText('Add Assessment'));

    fireEvent.click(screen.getByText('Add Row'));
    const nameInputs = screen.getAllByPlaceholderText('Quiz 1');
    fireEvent.change(nameInputs[0]!, { target: { value: 'Quiz 1' } });
    fireEvent.change(nameInputs[1]!, { target: { value: 'Quiz 2' } });
    const marksInputs = screen.getAllByPlaceholderText('100');
    fireEvent.change(marksInputs[0]!, { target: { value: '20' } });
    fireEvent.change(marksInputs[1]!, { target: { value: '20' } });

    fireEvent.click(screen.getByText('Create 2 Assessments'));

    await waitFor(() => expect(nemis.schoolAdmin.save).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Quiz 1')).toBeInTheDocument();
    expect(screen.getByText('Quiz 2')).toBeInTheDocument();
  });

  it('copies templates from one subject to another', async () => {
    const nemis = installBaseMock();
    const layer = createRendererPresentation();
    await layer.bootstrap.run();
    render(
      <PresentationProvider layer={layer}>
        <AssessmentSetupPage />
      </PresentationProvider>,
    );

    expect(await screen.findByText('Grade 10A')).toBeInTheDocument();
    const [classSelect, subjectSelect] = screen.getAllByRole('combobox');
    fireEvent.change(classSelect!, { target: { value: 'class-1' } });
    fireEvent.change(subjectSelect!, { target: { value: 'sub-1' } });

    // Create a template in the source subject (sub-1) via the bulk-create
    // table's default row — "Add Assessment" opens bulk-create mode by
    // default (Task 9); the single-record form is edit-only.
    fireEvent.click(await screen.findByText('Add Assessment'));
    fireEvent.change(screen.getByPlaceholderText('Quiz 1'), { target: { value: 'Quiz 1' } });
    fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '20' } });
    fireEvent.click(screen.getByText('Create 1 Assessment'));
    await screen.findByText('Quiz 1');

    fireEvent.click(screen.getByText('Copy to Subject'));
    // The target-subject <select> in the copy modal carries no accessible
    // name, so select it by DOM order (last of the now-three comboboxes:
    // class, subject, copy-target) — same pattern used in grades.test.tsx.
    const combos = screen.getAllByRole('combobox');
    fireEvent.change(combos[combos.length - 1]!, { target: { value: 'sub-2' } });
    fireEvent.click(screen.getByText('Copy'));

    await waitFor(() => expect(nemis.schoolAdmin.save).toHaveBeenCalledWith(
      expect.objectContaining({ record: expect.objectContaining({ name: 'Quiz 1', subjectId: 'sub-2' }) }),
    ));
  });

  it('re-enables the copy modal buttons after a failed copy instead of leaving them stuck disabled', async () => {
    const nemis = installBaseMock();
    const layer = createRendererPresentation();
    await layer.bootstrap.run();
    render(
      <PresentationProvider layer={layer}>
        <AssessmentSetupPage />
      </PresentationProvider>,
    );

    expect(await screen.findByText('Grade 10A')).toBeInTheDocument();
    const [classSelect, subjectSelect] = screen.getAllByRole('combobox');
    fireEvent.change(classSelect!, { target: { value: 'class-1' } });
    fireEvent.change(subjectSelect!, { target: { value: 'sub-1' } });

    fireEvent.click(await screen.findByText('Add Assessment'));
    fireEvent.change(screen.getByPlaceholderText('Quiz 1'), { target: { value: 'Quiz 1' } });
    fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '20' } });
    fireEvent.click(screen.getByText('Create 1 Assessment'));
    await screen.findByText('Quiz 1');

    // A rejected unhandled promise from the copy's save call is expected
    // here (production code intentionally lets the error propagate rather
    // than swallowing it — see CLAUDE.md "never fail silently" — matching
    // handleSubmit/handleBulkSubmit's existing try/finally-only pattern).
    // Suppress it at the process level so the test runner doesn't treat it
    // as a stray failure; the assertion below is what actually verifies the
    // fix (isCopying resets even though the save rejected).
    const suppressRejection = (reason: unknown) => {
      if (!(reason instanceof Error) || reason.message !== 'network error') throw reason;
    };
    process.on('unhandledRejection', suppressRejection);

    nemis.schoolAdmin.save.mockRejectedValueOnce(new Error('network error'));
    fireEvent.click(screen.getByText('Copy to Subject'));
    const combos = screen.getAllByRole('combobox');
    fireEvent.change(combos[combos.length - 1]!, { target: { value: 'sub-2' } });
    fireEvent.click(screen.getByText('Copy'));

    // While the copy is in-flight, both buttons are disabled ("Copying…" is
    // shown in place of "Copy").
    await screen.findByText('Copying…');

    // After the rejected save, isCopying must reset to false (the bug: it
    // previously stayed true forever, stranding the user in an unclosable,
    // unretriable modal) — the Copy button's label reverts and both buttons
    // become enabled again.
    await waitFor(() => expect(screen.getByText('Copy')).not.toBeDisabled());
    expect(screen.getByText('Cancel')).not.toBeDisabled();

    process.off('unhandledRejection', suppressRejection);
  });
});
