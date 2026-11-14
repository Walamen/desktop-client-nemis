import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

vi.mock('next/navigation', async () => (await import('@/test-utils/search-params')).navigationMock);

const data = vi.hoisted(() => ({
  windows: [] as Record<string, unknown>[],
  grades: [] as Record<string, unknown>[],
  assessments: [] as Record<string, unknown>[],
  failGradesOnce: false,
}));

vi.mock('@/services/nemis-bridge/shared', () => ({
  sharedBridge: {
    listSchoolAdminRecords: vi.fn(async ({ collection }: { collection: string }) => {
      if (collection === 'grades' && data.failGradesOnce) {
        data.failGradesOnce = false;
        throw new Error('boom');
      }
      const items =
        collection === 'grade_entry_windows' ? data.windows
        : collection === 'grades' ? data.grades
        : collection === 'assessments' ? data.assessments
        : [];
      return { items, total: items.length };
    }),
  },
}));

import { sharedBridge } from '@/services/nemis-bridge/shared';
import { mockSearch } from '@/test-utils/search-params';
import { Navigator } from '@/test-utils/navigator';
import { clearNemis, renderWithLayer, stubNemis } from './setup-test-support';
import { WindowGradesPage } from './WindowGradesPage';

const list = () => vi.mocked(sharedBridge.listSchoolAdminRecords);
const grade = (over: Record<string, unknown> = {}) => ({
  id: 'g1', studentId: 'st1', classId: 'c1', subjectId: 'sub1', gradingPeriodId: 'p1',
  assessmentId: null, marksObtained: 78.6, maxMarks: 100, percentage: 78.6, letterGrade: 'B',
  status: 'SUBMITTED', ...over,
});
const assessment = (over: Record<string, unknown> = {}) => ({
  id: 'a1', classId: 'c1', subjectId: 'sub1', gradingPeriodId: 'p1', name: 'Quiz 1',
  totalMarks: 20, weight: 20, date: '2026-02-01', ...over,
});
const page = (items: unknown[]) => ({ items, total: items.length, limit: 100, offset: 0 });
const studentRow = (id: string, fullName: string, nemisId: string) => ({
  id, fullName, nemisId, gradeLevel: 'GRADE_7', isActive: true, dateOfBirth: '2014-03-02',
  gender: 'FEMALE', updatedAt: '2026-10-01T00:00:00.000Z',
});
const classRow = (id: string, name: string, gradeLevel = 'GRADE_7') => ({
  id, academicYearId: 'y1', name, gradeLevel, isActive: true, subjectCount: 0,
});
const subjectRow = (id: string, name: string, code: string) => ({ id, name, code, isActive: true, classCount: 0 });

const stub = (classes = [classRow('c1', 'Grade 7A'), classRow('c2', 'Grade 7B')]) =>
  stubNemis({
    more: {
      student: {
        list: vi.fn(async () =>
          page([
            studentRow('st1', 'Grace Kollie', '250100420331'),
            studentRow('st3', 'Musu Kamara', '250100420349'),
            studentRow('st4', 'Joseph Doe', '250100420356'),
          ]),
        ),
      },
      classes: { list: vi.fn(async () => page(classes)) },
      subject: {
        list: vi.fn(async () => page([subjectRow('sub1', 'Mathematics', 'MTH'), subjectRow('sub2', 'Science', 'SCI')])),
      },
    },
  });

beforeEach(() => {
  stub();
  data.failGradesOnce = false;
  data.windows = [
    { id: 'win-1', name: 'Window One', gradingPeriodId: 'p1' },
    { id: 'win-2', name: 'Window Two', gradingPeriodId: 'p2' },
    { id: 'old-window', name: 'Old Window', gradingPeriodId: 'p1' },
  ];
  data.assessments = [
    assessment({ id: 'a1', name: 'Quiz 1', totalMarks: 20, weight: 20, date: '2026-02-01' }),
    assessment({ id: 'a2', name: 'Project', totalMarks: 50, weight: 30, date: '2026-02-10' }),
  ];
  data.grades = [
    grade({ id: 'q1', assessmentId: 'a1', marksObtained: 18, maxMarks: 20, percentage: null, letterGrade: null, status: 'DRAFT' }),
    grade({ id: 'q3', studentId: 'st3', assessmentId: 'a1', marksObtained: 12, maxMarks: 20, percentage: null, letterGrade: null, status: 'DRAFT' }),
    grade({ id: 'g1' }),
    grade({ id: 'g4', studentId: 'st4', percentage: null, letterGrade: null, marksObtained: 72, maxMarks: 100 }),
    grade({ id: 'g3', classId: 'c2', studentId: 'st2', subjectId: 'sub2' }),
    grade({ id: 'g2', gradingPeriodId: 'p2', classId: 'c2' }),
  ];
  window.history.pushState({}, '', '/government/school-admin/academic-grading/windows/grades?id=win-1');
  mockSearch('id=win-1');
});
afterEach(() => {
  clearNemis();
  list().mockClear();
});

describe('WindowGradesPage', () => {
  it('uses its own window, not the previous page\'s address', async () => {
    window.history.pushState({}, '', '/government/school-admin/academic-grading?id=old-window');
    mockSearch('id=win-1');
    await renderWithLayer(<WindowGradesPage />);
    expect(await screen.findByRole('heading', { name: 'Window One' })).toBeInTheDocument();
    expect(screen.queryByText('Old Window')).toBeNull();
  });

  it('shows not found without a window id', async () => {
    mockSearch('');
    await renderWithLayer(<WindowGradesPage />);
    expect(await screen.findByText('Window not found.')).toBeInTheDocument();
    expect(list().mock.calls.filter(([r]) => r.collection === 'grade_entry_windows')).toHaveLength(0);
    expect(list().mock.calls.filter(([r]) => r.collection === 'grades')).toHaveLength(0);
  });

  it('follows a changed window id and drops the old window\'s selections', async () => {
    await renderWithLayer(
      <Navigator
        to=""
        label="go none"
        page={() => <Navigator to="id=win-2" label="go win-2" page={() => <WindowGradesPage />} />}
      />,
    );
    expect(await screen.findByRole('heading', { name: 'Window One' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /Grade 7A/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'go win-2' }));
    expect(await screen.findByRole('heading', { name: 'Window Two' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /Grade 7B/ })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Grade 7A/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'go none' }));
    expect(await screen.findByText('Window not found.')).toBeInTheDocument();
  });

  it('renders one column per assessment with marks, weight and total', async () => {
    await renderWithLayer(<WindowGradesPage />);
    expect(await screen.findByText('Quiz 1')).toBeInTheDocument();
    expect(screen.getByText('/20 · 20%')).toBeInTheDocument();
    expect(screen.getByText('Project')).toBeInTheDocument();
    expect(screen.getByText('/50 · 30%')).toBeInTheDocument();
    const row = (await screen.findByText('Grace Kollie')).closest('tr')!;
    expect(within(row).getByText('18')).toBeInTheDocument();
    expect(within(row).getAllByText('—')).toHaveLength(1); // Project not entered
  });

  it('shows the final from the row without assessmentId, not the first matching row', async () => {
    await renderWithLayer(<WindowGradesPage />);
    const row = (await screen.findByText('Grace Kollie')).closest('tr')!;
    expect(within(row).getByText('78.6%')).toBeInTheDocument();
    expect(within(row).getByText('(B)')).toBeInTheDocument();
    expect(within(row).getByText('SUBMITTED')).toBeInTheDocument();
    expect(within(row).queryByText(/Published/)).toBeNull();
  });

  it('uses NEMIS ID and the subject name only', async () => {
    await renderWithLayer(<WindowGradesPage />);
    expect(await screen.findByRole('columnheader', { name: 'NEMIS ID' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search student name or NEMIS ID…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mathematics/ })).toBeInTheDocument();
    expect(screen.queryByText(/MTH/)).toBeNull();
  });

  it('counts finals only in the summary', async () => {
    await renderWithLayer(<WindowGradesPage />);
    await screen.findByText('Grace Kollie');
    // The value is the <p> right after the label <p> in each tile.
    const tile = (label: string) => screen.getByText(label).nextElementSibling!.textContent;
    expect(tile('Classes')).toBe('2');
    expect(tile('Students Graded')).toBe('3'); // st1, st2, st4 have finals; st3 only a quiz mark
    expect(tile('Finals Submitted')).toBe('3');
    expect(tile('Finals Published')).toBe('0');
  });

  it('switching class drops the previous subject and its columns', async () => {
    await renderWithLayer(<WindowGradesPage />);
    await screen.findByText('Quiz 1');
    expect(screen.getByRole('button', { name: /Mathematics/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Grade 7B/ }));
    expect(await screen.findByRole('button', { name: /Science/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mathematics/ })).toBeNull();
    expect(screen.queryByText('Quiz 1')).toBeNull();
  });

  it('shows a quiz mark and Not submitted for a student with marks but no final', async () => {
    await renderWithLayer(<WindowGradesPage />);
    const row = (await screen.findByText('Musu Kamara')).closest('tr')!;
    expect(within(row).getByText('12')).toBeInTheDocument();
    expect(within(row).getByText('Not submitted')).toBeInTheDocument();
  });

  it('falls back to marks/max when the final has no percentage', async () => {
    await renderWithLayer(<WindowGradesPage />);
    const row = (await screen.findByText('Joseph Doe')).closest('tr')!;
    expect(within(row).getByText('72/100')).toBeInTheDocument();
  });

  it('orders class pills by class name, not by grade-row order', async () => {
    stub([classRow('c1', 'Grade 7B'), classRow('c2', 'Grade 7A')]);
    await renderWithLayer(<WindowGradesPage />);
    await screen.findByRole('button', { name: /Science/ });
    const names = screen.getAllByRole('button', { name: /Grade 7/ }).map((b) => b.textContent);
    expect(names).toEqual(['Grade 7A', 'Grade 7B']);
  });

  it('orders class pills by grade level in enum order before name', async () => {
    // String order would put GRADE_10 before GRADE_9; the server's enum order does not.
    stub([classRow('c1', 'Grade 7A', 'GRADE_10'), classRow('c2', 'Grade 7B', 'GRADE_9')]);
    await renderWithLayer(<WindowGradesPage />);
    await screen.findByRole('button', { name: /Science/ });
    const names = screen.getAllByRole('button', { name: /Grade 7/ }).map((b) => b.textContent);
    expect(names).toEqual(['Grade 7B', 'Grade 7A']);
  });

  it('shows an error instead of spinning forever when the grades load fails', async () => {
    data.failGradesOnce = true;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await renderWithLayer(<WindowGradesPage />);
      expect(await screen.findByText("Couldn't load grades. It will retry after the next sync.")).toBeInTheDocument();
      expect(document.querySelector('.animate-spin')).toBeNull();
      expect(screen.queryByRole('table')).toBeNull();
      expect(consoleError).toHaveBeenCalledWith('[WindowGradesPage] load failed', expect.any(Error));
    } finally {
      consoleError.mockRestore();
    }
  });
});
