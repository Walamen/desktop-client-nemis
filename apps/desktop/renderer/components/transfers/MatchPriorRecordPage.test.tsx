import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { MatchPriorRecordPage } from './MatchPriorRecordPage';
import { PriorRecordsToMatchCard } from './PriorRecordsToMatchCard';
import { PriorRecordBanner } from './PriorRecordBanner';

const PREVIEW = {
  id: 'co-1',
  status: 'PENDING' as const,
  student: { id: 's-1', firstName: 'Ama', lastName: 'Kofi' },
  fromInstitutionName: 'Alpha School',
  sourcePeriods: [
    { id: 'a-p1', name: '1st Period', termName: 'Term 1' },
    { id: 'a-p2', name: '2nd Period', termName: 'Term 1' },
  ],
  sourceSubjects: [{ id: 'a-m', name: 'Mathematics', code: 'MATH' }],
  targetPeriods: [{ id: 'b-p1', name: 'Period One', termName: 'Semester 1' }],
  targetSubjects: [{ id: 'b-m', name: 'Maths', code: 'MAT' }],
  suggestion: { periods: { 'a-p1': 'b-p1', 'a-p2': null }, subjects: { 'a-m': 'b-m' } },
  saved: null,
};

let carryOver: Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  window.history.pushState({}, '', '/government/school-admin/students/match-prior-record?id=co-1');
  carryOver = {
    get: vi.fn(async () => PREVIEW),
    save: vi.fn(async () => ({ data: null, refreshed: true })),
    listPending: vi.fn(async () => []),
    listLocalPending: vi.fn(async () => [
      { id: 'co-1', studentId: 's-1', studentName: 'Ama Kofi', fromInstitutionName: 'Alpha School', createdAt: 'x' },
    ]),
  };
  (window as unknown as { nemis: unknown }).nemis = { carryOver };
});
afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  window.history.pushState({}, '', '/');
  vi.restoreAllMocks();
});

async function renderWith(ui: React.ReactElement, { online = true } = {}) {
  const layer = createRendererPresentation();
  if (!online) layer.stores.connectivity.setOnline(false);
  return render(<PresentationProvider layer={layer}>{ui}</PresentationProvider>);
}

describe('MatchPriorRecordPage', () => {
  it('shows the heading and pre-fills the suggestions', async () => {
    await renderWith(<MatchPriorRecordPage />);
    expect(await screen.findByRole('heading', { name: 'Match prior record — Ama Kofi' })).toBeInTheDocument();
    expect(screen.getByText('From Alpha School')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Grading periods' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Subjects' })).toBeInTheDocument();
    expect((screen.getByLabelText('Term 1 — 1st Period') as HTMLSelectElement).value).toBe('b-p1');
    expect((screen.getByLabelText('Term 1 — 2nd Period') as HTMLSelectElement).value).toBe('');
    expect((screen.getByLabelText('Mathematics') as HTMLSelectElement).value).toBe('b-m');
    expect(screen.getAllByRole('option', { name: 'Not matched' }).length).toBeGreaterThan(0);
  });

  it('confirms, then saves the matching and shows the success copy', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderWith(<MatchPriorRecordPage />);
    fireEvent.change(await screen.findByLabelText('Mathematics'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save matching' }));
    expect(confirm).toHaveBeenCalledWith('Save this matching? It cannot be changed afterwards.');
    await waitFor(() =>
      expect(carryOver.save).toHaveBeenCalledWith({
        carryOverId: 'co-1',
        periods: [
          { sourceGradingPeriodId: 'a-p1', targetGradingPeriodId: 'b-p1' },
          { sourceGradingPeriodId: 'a-p2', targetGradingPeriodId: null },
        ],
        subjects: [{ sourceSubjectId: 'a-m', targetSubjectId: null }],
      }),
    );
    expect(await screen.findByText('Prior record matched.')).toBeInTheDocument();
  });

  it('does nothing when the confirm is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await renderWith(<MatchPriorRecordPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save matching' }));
    expect(carryOver.save).not.toHaveBeenCalled();
  });

  it('shows the server message when the save is refused', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    carryOver.save!.mockRejectedValue(new Error('[REMOTE_REJECTED] This prior record has already been matched.'));
    await renderWith(<MatchPriorRecordPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save matching' }));
    expect(await screen.findByText('This prior record has already been matched.')).toBeInTheDocument();
  });

  it('shows a saved matching read-only', async () => {
    carryOver.get!.mockResolvedValue({ ...PREVIEW, status: 'SAVED', saved: PREVIEW.suggestion });
    await renderWith(<MatchPriorRecordPage />);
    expect(await screen.findByLabelText('Mathematics')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save matching' })).toBeNull();
  });

  it('offline: shows the note and does not load', async () => {
    await renderWith(<MatchPriorRecordPage />, { online: false });
    expect(await screen.findByText('Matching a prior record needs a connection.')).toBeInTheDocument();
    expect(carryOver.get).not.toHaveBeenCalled();
  });
});

describe('PriorRecordsToMatchCard', () => {
  it('lists the pending tasks with a link to each', async () => {
    await renderWith(<PriorRecordsToMatchCard />);
    expect(await screen.findByRole('heading', { name: 'Prior records to match' })).toBeInTheDocument();
    expect(screen.getByText('Ama Kofi — from Alpha School')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Match' })).toHaveAttribute(
      'href',
      '/government/school-admin/students/match-prior-record?id=co-1',
    );
  });

  it('renders nothing when there is no task', async () => {
    carryOver.listLocalPending!.mockResolvedValue([]);
    const { container } = await renderWith(<PriorRecordsToMatchCard />);
    await waitFor(() => expect(carryOver.listLocalPending).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe('PriorRecordBanner', () => {
  it("shows the banner for the student's pending task", async () => {
    await renderWith(<PriorRecordBanner studentId="s-1" />);
    expect(
      await screen.findByText("Ama Kofi's prior record from Alpha School has not been matched yet."),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Match prior record' })).toHaveAttribute(
      'href',
      '/government/school-admin/students/match-prior-record?id=co-1',
    );
  });

  it("shows nothing for another student, or when the list can't be read", async () => {
    const { container } = await renderWith(<PriorRecordBanner studentId="s-2" />);
    await waitFor(() => expect(carryOver.listLocalPending).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
