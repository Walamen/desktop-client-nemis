import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { clearNemis, renderWithLayer, stubNemis, yearRow } from '@/components/academic-grading/setup-test-support';
import { mockSearch } from '@/test-utils/search-params';
import { Navigator } from '@/test-utils/navigator';
import { CloseWorkflowPage } from './CloseWorkflowPage';

vi.mock('next/navigation', async () => (await import('@/test-utils/search-params')).navigationMock);

// Capture the sync-driven reload so a test can fire it; mount still loads once.
const revalidate = vi.hoisted(() => ({ load: null as null | (() => void) }));
vi.mock('@/hooks/use-revalidate-on-sync', async () => {
  const { useEffect } = await import('react');
  return {
    useRevalidateOnSync: (load: () => void, deps: readonly unknown[]) => {
      revalidate.load = load;
      // eslint-disable-next-line react-hooks/exhaustive-deps
      useEffect(() => { load(); }, deps);
    },
  };
});

const cell = {
  studentId: 's1', studentName: 'Ama Kofi', classId: 'c1', className: 'Grade 7A',
  subjectId: 'sub1', subjectName: 'Math', gradingPeriodId: 'p1', gradingPeriodName: 'Period 1',
};
const CLEAN = { noGradingPeriods: false, unpublishedPeriods: [], missingCells: [], cohort: { present: 2, withdrawn: 0 } };
const student = (over: Record<string, unknown> = {}) => ({
  studentId: 's1', name: 'Ama Kofi', nemisId: '100000000001', classId: 'c1', gradeLevel: 'GRADE_7',
  kind: 'PRESENT', yearlyAverage: 72, suggestion: 'PROMOTED', decision: null, principalRemark: null, ...over,
});
const PROMOTION = {
  passMark: 50,
  students: [student(), student({ studentId: 's2', name: 'Kofi Mensah', yearlyAverage: 40, suggestion: 'RETAINED' })],
};

function stubClose(over: Record<string, unknown> = {}) {
  const close = {
    getReadiness: vi.fn(async () => CLEAN),
    fillCells: vi.fn(async () => ({ data: null, refreshed: true })),
    getPromotion: vi.fn(async () => PROMOTION),
    savePromotion: vi.fn(async () => ({ data: null, refreshed: true })),
    closeYear: vi.fn(async () => ({ data: null, refreshed: true })),
    pendingChangesCount: vi.fn(async () => 0),
    ...over,
  };
  stubNemis({ years: [yearRow({ id: 'y1', code: '2025/2026' }), yearRow({ id: 'y2', code: '2026/2027' })] });
  (window as unknown as { nemis: Record<string, unknown> }).nemis.academicYearClose = close;
  return close;
}

beforeEach(() => {
  window.history.pushState({}, '', '/government/school-admin/academic-years/close?yearId=y1');
  mockSearch('yearId=y1');
});
afterEach(() => {
  clearNemis();
  vi.restoreAllMocks();
});

const CONFIRM = 'Close 2025/2026? Every grade, attendance mark and report card for this year will be frozen. Teachers, students and parents will be notified.';
const PENDING = 'This device has changes that have not reached the server yet. Sync them before closing the year.';

async function toConfirm() {
  await renderWithLayer(<CloseWorkflowPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Save and continue' }));
  await screen.findByText(CONFIRM);
}

describe('CloseWorkflowPage readiness', () => {
  it('lists blockers under the exact heading and submits a fill with its reason', async () => {
    const close = stubClose({
      getReadiness: vi.fn().mockResolvedValueOnce({ ...CLEAN, missingCells: [cell] }).mockResolvedValue(CLEAN),
    });
    await renderWithLayer(<CloseWorkflowPage />);
    expect(await screen.findByRole('heading', { name: 'Before this year can close' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Score for Ama Kofi, Math, Period 1'), { target: { value: '65' } });
    fireEvent.change(screen.getByLabelText('Reason for entering this mark'), { target: { value: 'Paper marks found' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save marks' }));
    await waitFor(() => expect(close.fillCells).toHaveBeenCalledWith({
      yearId: 'y1',
      entries: [{ studentId: 's1', subjectId: 'sub1', gradingPeriodId: 'p1', score: 65, reason: 'Paper marks found' }],
    }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled());
  });

  it('does not submit a mark without a reason', async () => {
    const close = stubClose({ getReadiness: vi.fn(async () => ({ ...CLEAN, missingCells: [cell] })) });
    await renderWithLayer(<CloseWorkflowPage />);
    fireEvent.change(await screen.findByLabelText('Score for Ama Kofi, Math, Period 1'), { target: { value: '65' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save marks' }));
    expect(close.fillCells).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent('Reason for entering this mark');
  });

  it('re-checks readiness from the server', async () => {
    const close = stubClose();
    await renderWithLayer(<CloseWorkflowPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Re-check' }));
    await waitFor(() => expect(close.getReadiness).toHaveBeenCalledTimes(2));
  });
});

describe('CloseWorkflowPage no grading periods', () => {
  it('blocks the close and says the year has no grading periods', async () => {
    stubClose({ getReadiness: vi.fn(async () => ({ ...CLEAN, noGradingPeriods: true })) });
    await renderWithLayer(<CloseWorkflowPage />);
    expect(await screen.findByRole('heading', { name: 'Before this year can close' })).toBeInTheDocument();
    expect(screen.getByText('This year has no grading periods.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });
});

describe('CloseWorkflowPage promotion', () => {
  async function toPromotion() {
    const close = stubClose();
    await renderWithLayer(<CloseWorkflowPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    await screen.findByText('Kofi Mensah');
    return close;
  }

  it('requires a reason when overriding the suggestion', async () => {
    const close = await toPromotion();
    fireEvent.change(screen.getByLabelText('Outcome for Kofi Mensah'), { target: { value: 'PROMOTED' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
    expect(close.savePromotion).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent('Give a reason');
    fireEvent.change(screen.getByLabelText('Reason for overriding Kofi Mensah'), { target: { value: 'Strong recovery' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
    await waitFor(() => expect(close.savePromotion).toHaveBeenCalledTimes(1));
    const call = close.savePromotion.mock.calls[0] as unknown as [{ decisions: Record<string, unknown>[] }];
    expect(call[0].decisions).toContainEqual({
      studentId: 's2', outcome: 'PROMOTED', nextGradeLevel: 'GRADE_8', overrideReason: 'Strong recovery',
    });
  });

  it('does not pre-select or require an override reason when there is no suggestion', async () => {
    const close = stubClose({
      getPromotion: vi.fn(async () => ({ passMark: 50, students: [student({ suggestion: null, yearlyAverage: null })] })),
    });
    await renderWithLayer(<CloseWorkflowPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    const select = (await screen.findByLabelText('Outcome for Ama Kofi')) as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(screen.queryByLabelText('Reason for overriding Ama Kofi')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
    expect(close.savePromotion).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose an outcome');
    fireEvent.change(select, { target: { value: 'PROMOTED' } });
    expect(screen.queryByLabelText('Reason for overriding Ama Kofi')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
    await waitFor(() => expect(close.savePromotion).toHaveBeenCalledTimes(1));
  });

  it('applies one principal remark to every student', async () => {
    const close = await toPromotion();
    fireEvent.change(screen.getByLabelText('Principal remark for all students'), { target: { value: 'Well done' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply to all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
    await waitFor(() => expect(close.savePromotion).toHaveBeenCalledTimes(1));
    const call = close.savePromotion.mock.calls[0] as unknown as [{ principalRemarks: unknown[] }];
    expect(call[0].principalRemarks).toEqual([
      { studentId: 's1', remark: 'Well done' },
      { studentId: 's2', remark: 'Well done' },
    ]);
  });
});

describe('CloseWorkflowPage confirm', () => {
  it('close is blocked while this device has pending changes', async () => {
    const close = stubClose({ pendingChangesCount: vi.fn(async () => 3) });
    await toConfirm();
    expect(await screen.findByText(PENDING)).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Close 2025/2026' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(close.closeYear).not.toHaveBeenCalled();
  });

  it('re-checks pending changes at click time and does not close', async () => {
    const count = vi.fn().mockResolvedValueOnce(0).mockResolvedValue(2);
    const close = stubClose({ pendingChangesCount: count });
    await toConfirm();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close 2025/2026' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Close 2025/2026' }));
    expect(await screen.findByText(PENDING)).toBeInTheDocument();
    expect(close.closeYear).not.toHaveBeenCalled();
  });

  it('says so and offers a retry when the pending count cannot be read', async () => {
    const close = stubClose({ pendingChangesCount: vi.fn(async () => { throw new Error('boom'); }) });
    await toConfirm();
    expect(await screen.findByText("Could not check this device's unsynced changes. Try again.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Close 2025/2026' })).toBeDisabled();
    expect(close.closeYear).not.toHaveBeenCalled();
  });

  it('confirm calls CLOSE_YEAR and reports success', async () => {
    const close = stubClose();
    await toConfirm();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close 2025/2026' })).toBeEnabled());
    expect(screen.queryByText(PENDING)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close 2025/2026' }));
    expect(await screen.findByText('2025/2026 is closed.')).toBeInTheDocument();
    expect(close.closeYear).toHaveBeenCalledWith('y1');
  });

  it('shows the server message when the close is refused and reloads readiness', async () => {
    const close = stubClose({
      closeYear: vi.fn(async () => { throw new Error('[REMOTE_REJECTED] A period was unpublished.'); }),
      getReadiness: vi.fn().mockResolvedValueOnce(CLEAN).mockResolvedValue({ ...CLEAN, unpublishedPeriods: [{ id: 'p9', name: 'Period 2' }] }),
    });
    await toConfirm();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close 2025/2026' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Close 2025/2026' }));
    expect(await screen.findByText('A period was unpublished.')).toBeInTheDocument();
    await waitFor(() => expect(close.getReadiness).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('heading', { name: 'Before this year can close' })).toBeInTheDocument();
  });
});

describe('CloseWorkflowPage year gate', () => {
  it('says the device will show the close after sync when not refreshed', async () => {
    stubClose({ closeYear: vi.fn(async () => ({ data: null, refreshed: false })) });
    await toConfirm();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close 2025/2026' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Close 2025/2026' }));
    expect(await screen.findByText('Closed. This device will show it after the next sync.')).toBeInTheDocument();
  });

  it('shows loading, not the workflow, until the years list loads', async () => {
    const close = stubClose();
    (window as unknown as { nemis: { academicYear: { list: unknown } } }).nemis.academicYear.list = vi.fn(() => new Promise(() => {}));
    await renderWithLayer(<CloseWorkflowPage />);
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
    expect(close.getReadiness).not.toHaveBeenCalled();
  });

  it('shows a notice instead of the workflow when the year is already closed', async () => {
    stubClose();
    stubNemis({ years: [yearRow({ id: 'y1', code: '2025/2026', status: 'CLOSED' })] });
    (window as unknown as { nemis: Record<string, unknown> }).nemis.academicYearClose = { getReadiness: vi.fn() };
    await renderWithLayer(<CloseWorkflowPage />);
    expect(await screen.findByText('This year is not open for closing.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  });
});

describe('CloseWorkflowPage reload during the workflow', () => {
  it('keeps the open step and its unsaved choices when a sync reload of the years fails', async () => {
    stubClose();
    await renderWithLayer(<CloseWorkflowPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    const remark = (await screen.findByLabelText('Principal remark for all students')) as HTMLInputElement;
    fireEvent.change(remark, { target: { value: 'Well done' } });
    const list = vi.fn(async () => { throw new Error('offline'); });
    (window as unknown as { nemis: { academicYear: { list: unknown } } }).nemis.academicYear.list = list;
    act(() => revalidate.load!());
    await waitFor(() => expect(list).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('Academic years could not be loaded.')).toBeNull());
    expect(screen.getByText('Kofi Mensah')).toBeInTheDocument();
    expect((screen.getByLabelText('Principal remark for all students') as HTMLInputElement).value).toBe('Well done');
    expect(screen.getByRole('heading', { name: 'Close 2025/2026' })).toBeInTheDocument();
  });
});

describe('CloseWorkflowPage year from the address', () => {
  it('uses its own year, not the previous page address', async () => {
    const close = stubClose();
    window.history.pushState({}, '', '/government/school-admin/academic-years?yearId=old-year');
    mockSearch('yearId=y1');
    await renderWithLayer(<CloseWorkflowPage />);
    expect(await screen.findByRole('button', { name: 'Continue' })).toBeInTheDocument();
    expect(close.getReadiness).toHaveBeenCalledWith('y1');
    expect(close.getReadiness).not.toHaveBeenCalledWith('old-year');
  });

  it('makes no call without a year id', async () => {
    const close = stubClose();
    mockSearch('');
    await renderWithLayer(<CloseWorkflowPage />);
    expect(await screen.findByText('Choose a year to close from Academic Years.')).toBeInTheDocument();
    expect(close.getReadiness).not.toHaveBeenCalled();
  });

  it('starts afresh when the year changes while mounted', async () => {
    const close = stubClose();
    await renderWithLayer(<Navigator to="yearId=y2" label="go y2" page={() => <CloseWorkflowPage />} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    await screen.findByLabelText('Principal remark for all students');
    expect(close.getPromotion).toHaveBeenCalledWith('y1');
    fireEvent.click(screen.getByRole('button', { name: 'go y2' }));
    expect(await screen.findByRole('heading', { name: 'Close 2026/2027' })).toBeInTheDocument();
    await waitFor(() => expect(close.getReadiness).toHaveBeenCalledWith('y2'));
    expect(screen.queryByLabelText('Principal remark for all students')).toBeNull();
    expect(await screen.findByRole('button', { name: 'Continue' })).toBeInTheDocument();
  });
});
