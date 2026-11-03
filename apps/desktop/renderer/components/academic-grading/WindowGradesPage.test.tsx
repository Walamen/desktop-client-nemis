import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', async () => (await import('@/test-utils/search-params')).navigationMock);

const data = vi.hoisted(() => ({
  windows: [] as Record<string, unknown>[],
  grades: [] as Record<string, unknown>[],
}));

vi.mock('@/services/nemis-bridge/shared', () => ({
  sharedBridge: {
    listSchoolAdminRecords: vi.fn(async ({ collection }: { collection: string }) => ({
      items: collection === 'grade_entry_windows' ? data.windows : collection === 'grades' ? data.grades : [],
      total: 0,
    })),
  },
}));

import { sharedBridge } from '@/services/nemis-bridge/shared';
import { mockSearch } from '@/test-utils/search-params';
import { clearNemis, renderWithLayer, stubNemis } from './setup-test-support';
import { WindowGradesPage } from './WindowGradesPage';

const list = () => vi.mocked(sharedBridge.listSchoolAdminRecords);
const grade = (over: Record<string, unknown> = {}) => ({
  id: 'g1', studentId: 'st1', classId: 'c1', subjectId: 'sub1', gradingPeriodId: 'p1',
  marksObtained: 40, maxMarks: 50, percentage: 80, letterGrade: 'A', status: 'SUBMITTED', ...over,
});

beforeEach(() => {
  stubNemis();
  data.windows = [
    { id: 'win-1', name: 'Window One', gradingPeriodId: 'p1' },
    { id: 'win-2', name: 'Window Two', gradingPeriodId: 'p2' },
    { id: 'old-window', name: 'Old Window', gradingPeriodId: 'p1' },
  ];
  data.grades = [grade(), grade({ id: 'g2', gradingPeriodId: 'p2', classId: 'c2' })];
  window.history.pushState({}, '', '/government/school-admin/academic-grading/windows/grades?id=win-1');
  mockSearch('id=win-1');
});
afterEach(() => {
  clearNemis();
  list().mockClear();
});

/** Re-renders the page after the address changes, inside the test's provider. */
function Navigator() {
  const [, bump] = useState(0);
  return (
    <>
      <button type="button" onClick={() => { mockSearch('id=win-2'); bump((n) => n + 1); }}>go win-2</button>
      <button type="button" onClick={() => { mockSearch(''); bump((n) => n + 1); }}>go none</button>
      <WindowGradesPage />
    </>
  );
}

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
    await renderWithLayer(<Navigator />);
    expect(await screen.findByRole('heading', { name: 'Window One' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /c1/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'go win-2' }));
    expect(await screen.findByRole('heading', { name: 'Window Two' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /c2/ })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /c1/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'go none' }));
    expect(await screen.findByText('Window not found.')).toBeInTheDocument();
  });
});
