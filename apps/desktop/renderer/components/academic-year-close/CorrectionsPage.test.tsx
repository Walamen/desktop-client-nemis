import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { clearNemis, renderWithLayer, stubNemis, yearRow } from '@/components/academic-grading/setup-test-support';
import { payloadFixture, summaryFixture } from '@/components/report-cards/fixtures';

const push = vi.fn();
let online = true;
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock('@/lib/presentation/hooks/shared', async (orig) => {
  const actual = await orig<typeof import('@/lib/presentation/hooks/shared')>();
  return {
    ...actual,
    useConnectivityStore: () => ({
      store: { getState: () => ({ isOnline: online }), subscribe: () => () => {}, getInitialState: () => ({ isOnline: online }) },
    }),
  };
});

import { CorrectionsPage } from './CorrectionsPage';

const REASON = 'Reason for this correction';
const student = (over: Record<string, unknown> = {}) => ({
  studentId: 'st-1', name: 'Grace Toe', nemisId: '482915736045', classId: 'cl-1', gradeLevel: 'GRADE_7',
  kind: 'PRESENT', yearlyAverage: 72, suggestion: 'PROMOTED', decision: null, principalRemark: null, ...over,
});

function stub(status = 'REOPENED', studentOver: Record<string, unknown> = {}) {
  const close = {
    getPromotion: vi.fn(async () => ({ passMark: 50, students: [student(studentOver), student({ studentId: 'st-2', name: 'Kofi Mensah', nemisId: '100000000002' })] })),
    correctGrade: vi.fn(async () => ({ data: null, refreshed: true })),
    correctOutcome: vi.fn(async () => ({ data: null, refreshed: true })),
    correctRemark: vi.fn(async () => ({ data: null, refreshed: true })),
  };
  const final = summaryFixture({ academicYearId: 'y1', kind: 'FINAL', issueId: 'iss-final' });
  const reportCards = {
    listForStudent: vi.fn(async () => [final]),
    getIssue: vi.fn(async () => ({ summary: final, payload: { ...payloadFixture(), kind: 'FINAL' as const } })),
  };
  stubNemis({ years: [yearRow({ id: 'y1', code: '2025/2026', status })] });
  Object.assign((window as unknown as { nemis: Record<string, unknown> }).nemis, { academicYearClose: close, reportCards });
  return Object.assign(close, { reportCards });
}

async function openStudent() {
  await renderWithLayer(<CorrectionsPage />);
  fireEvent.change(await screen.findByLabelText('Find a student'), { target: { value: 'grace' } });
  fireEvent.click(await screen.findByRole('button', { name: /Grace Toe/ }));
  await screen.findByRole('region', { name: 'Correct a mark' });
}

beforeEach(() => {
  online = true;
  push.mockClear();
  window.history.pushState({}, '', '/government/school-admin/academic-years/corrections?yearId=y1');
});
afterEach(() => {
  clearNemis();
  vi.restoreAllMocks();
});

describe('CorrectionsPage', () => {
  it('shows the title and the student final card', async () => {
    stub();
    await openStudent();
    expect(await screen.findByRole('heading', { name: 'Corrections — 2025/2026' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: /Mathematics/ })).toBeInTheDocument();
  });

  it('corrects a mark with its reason', async () => {
    const close = stub();
    await openStudent();
    const form = within(screen.getByRole('region', { name: 'Correct a mark' }));
    fireEvent.change(form.getByLabelText('New score'), { target: { value: '81' } });
    fireEvent.change(form.getByLabelText(REASON), { target: { value: 'Teacher mis-keyed' } });
    fireEvent.click(form.getByRole('button', { name: 'Correct mark' }));
    await waitFor(() => expect(close.correctGrade).toHaveBeenCalledWith({
      yearId: 'y1', studentId: 'st-1', subjectId: 'sub-1', gradingPeriodId: 'gp-1', score: 81, reason: 'Teacher mis-keyed',
    }));
  });

  it('blocks an empty reason on every action', async () => {
    const close = stub();
    await openStudent();
    const mark = within(screen.getByRole('region', { name: 'Correct a mark' }));
    fireEvent.change(mark.getByLabelText('New score'), { target: { value: '81' } });
    fireEvent.click(mark.getByRole('button', { name: 'Correct mark' }));
    expect(await mark.findByRole('alert')).toHaveTextContent(REASON);
    const outcome = within(screen.getByRole('region', { name: 'Change outcome' }));
    fireEvent.click(outcome.getByRole('button', { name: 'Change outcome' }));
    expect(await outcome.findByRole('alert')).toHaveTextContent(REASON);
    const remark = within(screen.getByRole('region', { name: 'Edit remark' }));
    fireEvent.change(remark.getByLabelText('Principal remark'), { target: { value: 'Good' } });
    fireEvent.click(remark.getByRole('button', { name: 'Save remark' }));
    expect(await remark.findByRole('alert')).toHaveTextContent(REASON);
    expect(close.correctGrade).not.toHaveBeenCalled();
    expect(close.correctOutcome).not.toHaveBeenCalled();
    expect(close.correctRemark).not.toHaveBeenCalled();
  });

  it('changes an outcome with its next grade and reason', async () => {
    const close = stub();
    await openStudent();
    const form = within(screen.getByRole('region', { name: 'Change outcome' }));
    fireEvent.change(form.getByLabelText('Outcome'), { target: { value: 'RETAINED' } });
    fireEvent.change(form.getByLabelText(REASON), { target: { value: 'Parent request' } });
    fireEvent.click(form.getByRole('button', { name: 'Change outcome' }));
    await waitFor(() => expect(close.correctOutcome).toHaveBeenCalledWith({
      yearId: 'y1', studentId: 'st-1', outcome: 'RETAINED', nextGradeLevel: 'GRADE_7', reason: 'Parent request',
    }));
  });

  it('edits the remark with its reason', async () => {
    const close = stub();
    await openStudent();
    const form = within(screen.getByRole('region', { name: 'Edit remark' }));
    fireEvent.change(form.getByLabelText('Principal remark'), { target: { value: 'Excellent year' } });
    fireEvent.change(form.getByLabelText(REASON), { target: { value: 'Typo fix' } });
    fireEvent.click(form.getByRole('button', { name: 'Save remark' }));
    await waitFor(() => expect(close.correctRemark).toHaveBeenCalledWith({
      yearId: 'y1', studentId: 'st-1', remark: 'Excellent year', reason: 'Typo fix',
    }));
  });

  it('shows the offline message and disables actions when offline', async () => {
    const close = stub();
    online = false;
    await openStudent();
    expect(screen.getByText("You're offline. Connect to the internet to do this.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Correct mark' })).toBeDisabled();
    expect(close.correctGrade).not.toHaveBeenCalled();
  });

  it('navigates to the close workflow for this year', async () => {
    stub();
    await renderWithLayer(<CorrectionsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Close the year again' }));
    expect(push).toHaveBeenCalledWith('/government/school-admin/academic-years/close?yearId=y1');
  });
  it.each(['ACTIVE', 'CLOSED'])('shows only the unavailable message for a %s year', async (status) => {
    stub(status);
    await renderWithLayer(<CorrectionsPage />);
    expect(await screen.findByText('Corrections are only available for a reopened year.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Academic Years' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close the year again' })).not.toBeInTheDocument();
  });

  it('shows the unavailable message for an unknown year', async () => {
    stub();
    window.history.pushState({}, '', '/government/school-admin/academic-years/corrections?yearId=nope');
    await renderWithLayer(<CorrectionsPage />);
    expect(await screen.findByText('Corrections are only available for a reopened year.')).toBeInTheDocument();
  });

  it('shows the unavailable message without a year id', async () => {
    stub();
    window.history.pushState({}, '', '/government/school-admin/academic-years/corrections');
    await renderWithLayer(<CorrectionsPage />);
    expect(await screen.findByText('Corrections are only available for a reopened year.')).toBeInTheDocument();
  });

  it('reloads the card after a correction', async () => {
    const close = stub();
    await openStudent();
    const form = within(screen.getByRole('region', { name: 'Correct a mark' }));
    fireEvent.change(form.getByLabelText('New score'), { target: { value: '81' } });
    fireEvent.change(form.getByLabelText(REASON), { target: { value: 'Fix' } });
    fireEvent.click(form.getByRole('button', { name: 'Correct mark' }));
    expect(await screen.findByText('Mark corrected.')).toBeInTheDocument();
    expect(close.reportCards.listForStudent).toHaveBeenCalledTimes(2);
    expect(close.reportCards.getIssue).toHaveBeenCalledTimes(2);
  });

  it('says the card updates after sync when the result was not refreshed', async () => {
    const close = stub();
    close.correctGrade.mockResolvedValue({ data: null, refreshed: false });
    await openStudent();
    const form = within(screen.getByRole('region', { name: 'Correct a mark' }));
    fireEvent.change(form.getByLabelText('New score'), { target: { value: '81' } });
    fireEvent.change(form.getByLabelText(REASON), { target: { value: 'Fix' } });
    fireEvent.click(form.getByRole('button', { name: 'Correct mark' }));
    expect(await screen.findByText('Saved. The card will update after the next sync.')).toBeInTheDocument();
  });

  it('offers only periods with a graded value for the subject', async () => {
    stub();
    await openStudent();
    const form = within(screen.getByRole('region', { name: 'Correct a mark' }));
    const options = Array.from(form.getByLabelText('Period').querySelectorAll('option')).map((o) => o.textContent);
    expect(options).toEqual(['Period 1']);
  });

  it('defaults the outcome to the saved decision', async () => {
    stub('REOPENED', { decision: { outcome: 'RETAINED', nextGradeLevel: 'GRADE_7', overrideReason: 'x' } });
    await openStudent();
    const form = within(screen.getByRole('region', { name: 'Change outcome' }));
    expect((form.getByLabelText('Outcome') as HTMLSelectElement).value).toBe('RETAINED');
  });
});
