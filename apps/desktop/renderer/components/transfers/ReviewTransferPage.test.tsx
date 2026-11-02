import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TransferRecordPreview } from '@nemis-desktop/types';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { payloadFixture } from '../report-cards/fixtures';
import { ReviewTransferPage } from './ReviewTransferPage';

vi.setConfig({ testTimeout: 20_000 });

const US = 'inst-1';
const school = {
  id: US, code: 'S1', name: 'Test School', type: 'PUBLIC', ownership: 'GOVERNMENT',
  approvalStatus: 'APPROVED', isApproved: true,
};
const currentYear = {
  id: 'y1', institutionId: US, code: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-31',
  isCurrent: true, status: 'ACTIVE', termCount: 1, classCount: 1,
};
const term1 = {
  id: 't1', academicYearId: 'y1', name: 'Term 1', sequence: 1, startDate: '2025-09-01', endDate: '2025-12-15', isCurrent: true,
};
const jss1a = { id: 'c1', academicYearId: 'y1', name: 'JSS1-A', gradeLevel: 'GRADE_7', isActive: true, subjectCount: 0 };

const PREVIEW: TransferRecordPreview = {
  transferId: 'tr-1',
  initiatedBy: 'ORIGIN_SCHOOL',
  fromInstitutionName: 'Alpha School',
  reason: 'Family moved',
  requestedAt: '2026-09-20T10:00:00.000Z',
  student: { id: 's-1', firstName: 'Ama', lastName: 'Kofi' },
  currentGradeLevel: 'GRADE_7',
  currentClassName: 'JSS1-A',
  reportCards: [{ gradingPeriodId: 'a-p1', gradingPeriodName: '1st Period', version: 1, payload: payloadFixture() }],
  attendance: [
    { gradingPeriodName: '1st Period', present: 40, absent: 3, late: 1, excused: 2, sick: 0 },
    { gradingPeriodName: '2nd Period', present: 38, absent: 5, late: 0, excused: 1, sick: 2 },
  ],
  matching: {
    sourcePeriods: [
      { id: 'a-p1', name: '1st Period', termName: 'Term 1' },
      { id: 'a-p2', name: '2nd Period', termName: 'Term 1' },
    ],
    sourceSubjects: [
      { id: 'a-m', name: 'Mathematics', code: 'MATH' },
      { id: 'a-e', name: 'English', code: 'ENG' },
    ],
    targetPeriods: [{ id: 'b-p1', name: 'Period One', termName: 'Semester 1' }],
    targetSubjects: [{ id: 'b-m', name: 'Maths', code: 'MAT' }],
    suggestion: { periods: { 'a-p1': 'b-p1', 'a-p2': null }, subjects: { 'a-m': 'b-m', 'a-e': null } },
  },
  sourceCells: [
    { subjectId: 'a-m', gradingPeriodId: 'a-p1' },
    { subjectId: 'a-e', gradingPeriodId: 'a-p1' },
    { subjectId: 'a-m', gradingPeriodId: 'a-p2' },
  ],
  forwardedCount: 0,
  draft: null,
};

const ROW_WITH_PLACEMENT = {
  id: 'tr-1', studentId: 's-1', fromInstitutionId: 'inst-2', toInstitutionId: US, status: 'PENDING',
  initiatedBy: 'ORIGIN_SCHOOL', classId: 'c1', termId: 't1', toGradeLevel: 'GRADE_7',
};
const ROW_WITHOUT_PLACEMENT = { ...ROW_WITH_PLACEMENT, classId: null, termId: null, toGradeLevel: null };

function stub(opts: { preview?: Partial<TransferRecordPreview>; row?: Record<string, unknown> } = {}) {
  const recordPreview = vi.fn(async () => ({ ...PREVIEW, ...opts.preview }));
  const review = vi.fn<(req: unknown) => Promise<{ data: { id: string; recordBroughtOver: boolean }; refreshed: boolean }>>(
    async () => ({ data: { id: 'tr-1', recordBroughtOver: true }, refreshed: true }),
  );
  const saveMatchingDraft = vi.fn<(req: unknown) => Promise<{ data: null; refreshed: boolean }>>(async () => ({ data: null, refreshed: true }));
  const clearMatchingDraft = vi.fn<(id: string) => Promise<{ data: null; refreshed: boolean }>>(async () => ({ data: null, refreshed: true }));
  const list = vi.fn(async () => ({ items: [opts.row ?? ROW_WITH_PLACEMENT], total: 1 }));
  (window as unknown as { nemis: unknown }).nemis = {
    school: { getSummary: vi.fn(async () => school) },
    academicYear: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => [currentYear]) },
    term: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => [term1]) },
    classes: { list: vi.fn(async () => ({ items: [jss1a], total: 1 })) },
    schoolAdmin: { list },
    transfer: { recordPreview, review, saveMatchingDraft, clearMatchingDraft },
  };
  return { recordPreview, review, saveMatchingDraft, clearMatchingDraft };
}

beforeEach(() => {
  window.history.pushState({}, '', '/government/school-admin/students/inter-school-transfer/review?id=tr-1');
});
afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  window.history.pushState({}, '', '/');
  vi.restoreAllMocks();
});

async function renderPage({ online = true } = {}) {
  const layer = createRendererPresentation();
  await layer.bootstrap.run();
  if (!online) layer.stores.connectivity.setOnline(false);
  const user = userEvent.setup({ delay: null });
  render(
    <PresentationProvider layer={layer}>
      <ReviewTransferPage />
    </PresentationProvider>,
  );
  return { user };
}

const button = (name: string) => screen.getByRole('button', { name });

async function toDecide(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Next: match the record' }));
  await user.click(button('Next'));
}

function selectNear(labelPattern: RegExp): HTMLSelectElement {
  const label = Array.from(document.querySelectorAll('label')).find((l) => labelPattern.test(l.textContent ?? ''));
  const select = label?.parentElement?.querySelector('select');
  if (!(select instanceof HTMLSelectElement)) throw new Error(`Expected a <select> near label ${labelPattern}`);
  return select;
}

describe('ReviewTransferPage', () => {
  it('step 1 shows the heading, where the child is now, the cards and the attendance', async () => {
    stub();
    await renderPage();

    expect(await screen.findByRole('heading', { name: 'Review transfer — Ama Kofi' })).toBeInTheDocument();
    expect(screen.getByText('From Alpha School · Requested 2026-09-20 · Reason: Family moved')).toBeInTheDocument();
    for (const label of ['1. Record', '2. Match', '3. Decide']) expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText('Now at Alpha School: GRADE 7 · JSS1-A')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Report cards this year' })).toBeInTheDocument();
    expect(screen.getByText('Monrovia Central High')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Attendance' })).toBeInTheDocument();
    const second = screen.getByRole('row', { name: /2nd Period/ });
    expect(within(second).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      '2nd Period', '38', '5', '0', '1', '2',
    ]);
    expect(button('Reject')).toBeInTheDocument();
  });

  it('step 1 says so when no report cards are issued, and copes with no grade level', async () => {
    stub({ preview: { reportCards: [], currentGradeLevel: null } });
    await renderPage();

    expect(await screen.findByText('No report cards issued yet this year.')).toBeInTheDocument();
    expect(screen.getByText('Now at Alpha School: JSS1-A')).toBeInTheDocument();
  });

  it('Next opens the match step pre-filled from the suggestion', async () => {
    stub();
    const { user } = await renderPage();
    await user.click(await screen.findByRole('button', { name: 'Next: match the record' }));

    expect(screen.getByRole('heading', { name: 'Grading periods' })).toBeInTheDocument();
    expect((screen.getByLabelText('Term 1 — 1st Period') as HTMLSelectElement).value).toBe('b-p1');
    expect((screen.getByLabelText('Term 1 — 2nd Period') as HTMLSelectElement).value).toBe('');
    expect((screen.getByLabelText('Mathematics') as HTMLSelectElement).value).toBe('b-m');
    expect((screen.getByLabelText('English') as HTMLSelectElement).value).toBe('');
    expect(button('Back')).toBeInTheDocument();
    expect(button('Skip matching')).toBeInTheDocument();
  });

  it('Skip matching shows "Not matched yet." and Approve sends no matching', async () => {
    const { review } = stub();
    const { user } = await renderPage();
    await user.click(await screen.findByRole('button', { name: 'Next: match the record' }));
    await user.click(button('Skip matching'));

    expect(screen.getByText('Not matched yet.')).toBeInTheDocument();
    await user.click(button('Approve'));
    await waitFor(() => expect(review).toHaveBeenCalledTimes(1));
    expect(review.mock.calls[0]?.[0]).toStrictEqual({ id: 'tr-1', status: 'APPROVED' });
    expect(await screen.findByText('Approved. The record has been brought over.')).toBeInTheDocument();
  });

  it('Approve with a matching counts what comes over and sends the array form', async () => {
    const { review } = stub();
    const { user } = await renderPage();
    await toDecide(user);

    // Only (Mathematics, 1st Period) has both a period and a subject matched.
    expect(screen.getByText('1 marks and 2 attendance periods will come over.')).toBeInTheDocument();
    await user.click(button('Approve'));
    await waitFor(() => expect(review).toHaveBeenCalledTimes(1));
    expect(review.mock.calls[0]?.[0]).toStrictEqual({
      id: 'tr-1',
      status: 'APPROVED',
      matching: {
        periods: [
          { sourceGradingPeriodId: 'a-p1', targetGradingPeriodId: 'b-p1' },
          { sourceGradingPeriodId: 'a-p2', targetGradingPeriodId: null },
        ],
        subjects: [
          { sourceSubjectId: 'a-m', targetSubjectId: 'b-m' },
          { sourceSubjectId: 'a-e', targetSubjectId: null },
        ],
      },
    });
    expect(await screen.findByText('Approved. The record has been brought over.')).toBeInTheDocument();
  });

  it('counts no attendance when no period is matched', async () => {
    stub({ preview: { matching: { ...PREVIEW.matching, suggestion: { periods: {}, subjects: { 'a-m': 'b-m' } } } } });
    const { user } = await renderPage();
    await toDecide(user);
    expect(screen.getByText('0 marks and 0 attendance periods will come over.')).toBeInTheDocument();
  });

  it('shows the not-brought-over copy when the server skipped the matching', async () => {
    const { review } = stub();
    review.mockResolvedValueOnce({ data: { id: 'tr-1', recordBroughtOver: false }, refreshed: true });
    const { user } = await renderPage();
    await toDecide(user);
    await user.click(button('Approve'));
    expect(
      await screen.findByText(
        "Approved. The record could not be brought over automatically — match it from the student's profile.",
      ),
    ).toBeInTheDocument();
  });

  it('asks for class and term only when the request has none, and sends them', async () => {
    const { review } = stub({ row: ROW_WITHOUT_PLACEMENT });
    const { user } = await renderPage();
    await toDecide(user);

    expect(button('Approve')).toBeDisabled();
    await user.selectOptions(selectNear(/^grade/i), 'GRADE_7');
    await waitFor(() => expect(selectNear(/^class/i).querySelector('option[value="c1"]')).not.toBeNull());
    await user.selectOptions(selectNear(/^class/i), 'c1');
    await waitFor(() => expect(selectNear(/^term/i).querySelector('option[value="t1"]')).not.toBeNull());
    await user.selectOptions(selectNear(/^term/i), 't1');
    expect(button('Approve')).toBeEnabled();
    await user.click(button('Approve'));
    await waitFor(() => expect(review).toHaveBeenCalledTimes(1));
    expect(review.mock.calls[0]?.[0]).toMatchObject({ id: 'tr-1', status: 'APPROVED', classId: 'c1', termId: 't1' });
  });

  it('shows a server refusal and keeps the page', async () => {
    const { review } = stub();
    review.mockRejectedValueOnce(new Error('[REMOTE_REJECTED] The selected term is not in the current academic year.'));
    const { user } = await renderPage();
    await toDecide(user);
    await user.click(button('Approve'));

    expect(await screen.findByText('The selected term is not in the current academic year.')).toBeInTheDocument();
    expect(button('Approve')).toBeEnabled();
  });

  it('Reject uses the reject command', async () => {
    const { review } = stub();
    const { user } = await renderPage();
    await user.click(await screen.findByRole('button', { name: 'Reject' }));
    await user.click(screen.getByRole('button', { name: 'Confirm rejection' }));
    await waitFor(() => expect(review).toHaveBeenCalledWith({ id: 'tr-1', status: 'REJECTED' }));
    expect(await screen.findByText('Transfer rejected.')).toBeInTheDocument();
  });

  it('own request: seeds from the saved draft, saves and clears it, with no Approve or Reject', async () => {
    const draft = { periods: { 'a-p1': null, 'a-p2': 'b-p1' }, subjects: { 'a-m': 'b-m', 'a-e': null } };
    const { saveMatchingDraft, clearMatchingDraft } = stub({ preview: { initiatedBy: 'RECEIVING_SCHOOL', draft } });
    const { user } = await renderPage();

    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
    await user.click(await screen.findByRole('button', { name: 'Next: match the record' }));
    expect((screen.getByLabelText('Term 1 — 2nd Period') as HTMLSelectElement).value).toBe('b-p1');
    await user.click(button('Next'));

    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
    await user.click(button('Save matching'));
    await waitFor(() => expect(saveMatchingDraft).toHaveBeenCalledTimes(1));
    expect(saveMatchingDraft.mock.calls[0]?.[0]).toStrictEqual({
      transferId: 'tr-1',
      periods: [
        { sourceGradingPeriodId: 'a-p1', targetGradingPeriodId: null },
        { sourceGradingPeriodId: 'a-p2', targetGradingPeriodId: 'b-p1' },
      ],
      subjects: [
        { sourceSubjectId: 'a-m', targetSubjectId: 'b-m' },
        { sourceSubjectId: 'a-e', targetSubjectId: null },
      ],
    });
    expect(
      await screen.findByText('Matching saved. It will be applied when Alpha School approves.'),
    ).toBeInTheDocument();

    await user.click(button('Clear saved matching'));
    await waitFor(() => expect(clearMatchingDraft).toHaveBeenCalledWith('tr-1'));
    expect(await screen.findByText('Saved matching cleared.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear saved matching' })).toBeNull();
  });

  it('own request without a draft offers no "Clear saved matching" until one is saved', async () => {
    stub({ preview: { initiatedBy: 'RECEIVING_SCHOOL' } });
    const { user } = await renderPage();
    await toDecide(user);
    expect(screen.queryByRole('button', { name: 'Clear saved matching' })).toBeNull();
    await user.click(button('Save matching'));
    expect(await screen.findByRole('button', { name: 'Clear saved matching' })).toBeInTheDocument();
  });

  it('offline: shows the connection note, no buttons, and never loads the preview', async () => {
    const { recordPreview } = stub();
    await renderPage({ online: false });
    expect(screen.getByText('Matching a prior record needs a connection.')).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(recordPreview).not.toHaveBeenCalled();
  });
});
