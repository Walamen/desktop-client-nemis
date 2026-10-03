import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CohortResult, CohortRow, CompletionGuidanceRow } from '@nemis-desktop/types';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { EndOfYearOutcomesPage } from './EndOfYearOutcomesPage';

// Multi-step walks; under a parallel run they can exceed the 5s default.
vi.setConfig({ testTimeout: 20_000 });

const US = 'inst-1';
const school = {
  id: US, code: 'S1', name: 'Test School', type: 'PUBLIC', ownership: 'GOVERNMENT',
  approvalStatus: 'APPROVED', isApproved: true,
};
const currentYear = {
  id: 'y1', institutionId: US, code: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-31',
  isCurrent: true, status: 'ACTIVE', termCount: 1, classCount: 2,
};
const lastYear = { ...currentYear, id: 'y0', code: '2024/2025', isCurrent: false, status: 'CLOSED' };

const AMA = 'stu-0001-ama';
const BENDU = 'stu-0002-bendu';
const COMFORT = 'stu-0003-comfort';

const cohortRow = (over: Partial<CohortRow>): CohortRow => ({
  studentId: AMA, firstName: 'Ama', lastName: 'Kollie', nemisId: null, outcome: null,
  nextGradeLevel: null, notes: null, syncState: null, syncError: null, ...over,
});
const ama = cohortRow({
  studentId: AMA, nemisId: '482915736045', outcome: 'PROMOTED', nextGradeLevel: 'GRADE_8', syncState: 'synced',
});
const bendu = cohortRow({
  studentId: BENDU, firstName: 'Bendu', lastName: 'Sirleaf', nemisId: '111122223333', outcome: 'RETAINED',
  nextGradeLevel: 'GRADE_7', notes: 'Needs support', syncState: 'pending',
});
const comfort = cohortRow({ studentId: COMFORT, firstName: 'Comfort', lastName: 'Doe' });

type Stubs = {
  years?: unknown[];
  cohorts?: CohortResult[];
  guidance?: () => Promise<CompletionGuidanceRow[]>;
  gradeCounts?: unknown[];
};

function stubNemis(stubs: Stubs = {}) {
  const cohorts = stubs.cohorts ?? [{ rows: [ama, bendu, comfort], unenrolledCount: 0 }];
  let call = 0;
  const cohort = vi.fn(async () => {
    const result = cohorts[Math.min(call, cohorts.length - 1)];
    call += 1;
    return result as CohortResult;
  });
  const save = vi.fn(async (req: { decisions: unknown[] }) => ({ saved: req.decisions.length }));
  const discard = vi.fn(async () => ({ discarded: true }));
  const guidance = vi.fn(stubs.guidance ?? (async () => []));
  (window as unknown as { nemis: unknown }).nemis = {
    school: { getSummary: vi.fn(async () => school) },
    academicYear: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => stubs.years ?? [lastYear, currentYear]) },
    term: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => []) },
    classes: {
      list: vi.fn(async () => ({ items: [], total: 0 })),
      gradeLevelCounts: vi.fn(async () =>
        stubs.gradeCounts ?? [
          { gradeLevel: 'GRADE_7', classCount: 2 },
          { gradeLevel: 'GRADE_8', classCount: 1 },
        ],
      ),
    },
    gradeCompletion: { cohort, save, discard, guidance },
  };
  return { cohort, save, discard, guidance };
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

async function renderPage({ online = true }: { online?: boolean } = {}) {
  const layer = createRendererPresentation();
  await layer.bootstrap.run();
  if (!online) layer.stores.connectivity.setOnline(false);
  const user = userEvent.setup({ delay: null });
  const view = render(
    <PresentationProvider layer={layer}>
      <EndOfYearOutcomesPage />
    </PresentationProvider>,
  );
  await screen.findByRole('heading', { name: 'End-of-Year Outcomes' });
  return { user, layer, ...view };
}

type User = ReturnType<typeof userEvent.setup>;

async function pickGrade(user: User, grade = 'GRADE_7') {
  const select = screen.getByRole('combobox', { name: 'Grade' });
  await waitFor(() => expect(select.querySelector(`option[value="${grade}"]`)).not.toBeNull());
  await user.selectOptions(select, grade);
}

const rowOf = (name: string) => screen.getByRole('row', { name: `Outcome for ${name}` });
const findRow = (name: string) => screen.findByRole('row', { name: `Outcome for ${name}` });
const outcomeIn = (row: HTMLElement) => within(row).getByRole('combobox', { name: 'Outcome' }) as HTMLSelectElement;
const nextGradeIn = (row: HTMLElement) =>
  within(row).getByRole('combobox', { name: 'Next grade' }) as HTMLSelectElement;

describe('EndOfYearOutcomesPage', () => {
  it('renders the cohort with names, formatted NEMIS IDs and sync badges for the current year', async () => {
    const { cohort } = stubNemis();
    const { user } = await renderPage();
    await pickGrade(user);

    const amaRow = await findRow('Ama Kollie');
    await waitFor(() => expect(cohort).toHaveBeenCalledWith('y1', 'GRADE_7'));
    expect(within(amaRow).getByText('4829-1573-6045')).toBeInTheDocument();
    expect(within(amaRow).getByText('Synced')).toBeInTheDocument();
    expect(outcomeIn(amaRow).value).toBe('PROMOTED');
    expect(nextGradeIn(amaRow).value).toBe('GRADE_8');

    const benduRow = rowOf('Bendu Sirleaf');
    expect(within(benduRow).getByText('1111-2222-3333')).toBeInTheDocument();
    expect(within(benduRow).getByText('Pending')).toBeInTheDocument();
    expect(within(benduRow).getByRole('textbox', { name: 'Notes' })).toHaveValue('Needs support');

    const comfortRow = rowOf('Comfort Doe');
    expect(within(comfortRow).queryByText(/Synced|Pending|Rejected/)).toBeNull();
    expect(outcomeIn(comfortRow).value).toBe('');
  });

  it('defaults the next grade from the outcome, and Graduated clears and disables it', async () => {
    stubNemis();
    const { user } = await renderPage();
    await pickGrade(user);
    const row = await findRow('Comfort Doe');

    await user.selectOptions(outcomeIn(row), 'PROMOTED');
    expect(nextGradeIn(row).value).toBe('GRADE_8');
    await user.selectOptions(outcomeIn(row), 'RETAINED');
    expect(nextGradeIn(row).value).toBe('GRADE_7');
    await user.selectOptions(outcomeIn(row), 'GRADUATED');
    expect(nextGradeIn(row).value).toBe('');
    expect(nextGradeIn(row)).toBeDisabled();
  });

  it('limits next-grade choices to the grades the school offers', async () => {
    stubNemis();
    const { user } = await renderPage();
    await pickGrade(user);
    const row = await findRow('Comfort Doe');
    await user.selectOptions(outcomeIn(row), 'RETAINED');
    const values = Array.from(nextGradeIn(row).options).map((o) => o.value).filter(Boolean);
    expect(values).toEqual(['GRADE_7', 'GRADE_8']);
  });

  it('offers every grade when the device has no grade-level data', async () => {
    stubNemis({ gradeCounts: [] });
    const { user } = await renderPage();
    await pickGrade(user);
    const row = await findRow('Comfort Doe');
    await user.selectOptions(outcomeIn(row), 'RETAINED');
    const values = Array.from(nextGradeIn(row).options).map((o) => o.value).filter(Boolean);
    expect(values).toHaveLength(15);
  });

  it('saves exactly the visible table’s decisions, shows the sync copy and reloads', async () => {
    const { save, cohort } = stubNemis();
    const { user } = await renderPage();
    await pickGrade(user);
    const row = await findRow('Comfort Doe');
    await user.selectOptions(outcomeIn(row), 'GRADUATED');
    await user.type(within(row).getByRole('textbox', { name: 'Notes' }), '   ');

    await user.click(screen.getByRole('button', { name: 'Save outcomes' }));

    await screen.findByText('Grade changes apply after sync.');
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({
      academicYearId: 'y1',
      gradeLevel: 'GRADE_7',
      decisions: [
        { studentId: AMA, outcome: 'PROMOTED', nextGradeLevel: 'GRADE_8' },
        { studentId: BENDU, outcome: 'RETAINED', nextGradeLevel: 'GRADE_7', notes: 'Needs support' },
        { studentId: COMFORT, outcome: 'GRADUATED' },
      ],
    });
    await waitFor(() => expect(cohort).toHaveBeenCalledTimes(2));
  });

  it('refuses to save a Promoted row with no next grade', async () => {
    const { save } = stubNemis({
      cohorts: [{ rows: [cohortRow({ outcome: null })], unenrolledCount: 0 }],
      gradeCounts: [{ gradeLevel: 'GRADE_12', classCount: 1 }],
    });
    const { user } = await renderPage();
    await pickGrade(user, 'GRADE_12');
    const row = await findRow('Ama Kollie');
    await user.selectOptions(outcomeIn(row), 'PROMOTED');
    expect(nextGradeIn(row).value).toBe('');
    await user.click(screen.getByRole('button', { name: 'Save outcomes' }));
    expect(await screen.findByText('Choose a next grade for Ama Kollie.')).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it('offline: shows a dash and the note for averages and never asks for guidance', async () => {
    const { guidance } = stubNemis();
    const { user } = await renderPage({ online: false });
    await pickGrade(user);
    const row = await findRow('Ama Kollie');
    expect(within(row).getByText('—')).toBeInTheDocument();
    expect(screen.getByText('Averages are shown when online.')).toBeInTheDocument();
    expect(guidance).not.toHaveBeenCalled();
  });

  it('online: shows each student’s average from the guidance', async () => {
    const { guidance } = stubNemis({
      guidance: async () => [
        { studentId: AMA, average: 78.5 },
        { studentId: BENDU, average: null },
      ],
    });
    const { user } = await renderPage();
    await pickGrade(user);
    await waitFor(() => expect(guidance).toHaveBeenCalledWith('y1', 'GRADE_7'));
    const row = await findRow('Ama Kollie');
    expect(await within(row).findByText('78.5')).toBeInTheDocument();
    expect(within(rowOf('Bendu Sirleaf')).getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('Averages are shown when online.')).toBeNull();
  });

  it('states how many students of the grade have no enrolment that year', async () => {
    stubNemis({ cohorts: [{ rows: [ama], unenrolledCount: 3 }] });
    const { user } = await renderPage();
    await pickGrade(user);
    expect(
      await screen.findByText('3 students in this grade have no enrolment for this year and are not listed.'),
    ).toBeInTheDocument();
  });

  it('shows a rejected row’s server message with names, and an edit + save makes it pending', async () => {
    const message = `Some students already have a completion recorded in that academic year: ${AMA}, ${BENDU}`;
    const rejectedAma = { ...ama, syncState: 'rejected' as const, syncError: message };
    const rejectedBendu = { ...bendu, syncState: 'rejected' as const, syncError: message };
    const { save } = stubNemis({
      cohorts: [
        { rows: [rejectedAma, rejectedBendu], unenrolledCount: 0 },
        {
          rows: [
            { ...rejectedAma, outcome: 'RETAINED', nextGradeLevel: 'GRADE_7', syncState: 'pending', syncError: null },
            { ...rejectedBendu, syncState: 'pending', syncError: null },
          ],
          unenrolledCount: 0,
        },
      ],
    });
    const { user } = await renderPage();
    await pickGrade(user);
    const row = await findRow('Ama Kollie');
    expect(within(row).getByText('Rejected')).toBeInTheDocument();
    expect(
      within(row).getByText(
        'Some students already have a completion recorded in that academic year: Ama Kollie, Bendu Sirleaf',
      ),
    ).toBeInTheDocument();

    await user.selectOptions(outcomeIn(row), 'RETAINED');
    await user.click(screen.getByRole('button', { name: 'Save outcomes' }));

    await screen.findByText('Grade changes apply after sync.');
    expect(save.mock.calls[0]?.[0].decisions).toContainEqual({
      studentId: AMA, outcome: 'RETAINED', nextGradeLevel: 'GRADE_7',
    });
    await waitFor(() => expect(within(rowOf('Ama Kollie')).getByText('Pending')).toBeInTheDocument());
    expect(within(rowOf('Ama Kollie')).queryByText(/already have a completion/)).toBeNull();
  });

  it('offers “Discard my change” on pending and rejected rows only, and reloads after it', async () => {
    const rejected = { ...comfort, outcome: 'GRADUATED' as const, syncState: 'rejected' as const, syncError: 'No' };
    const { discard, cohort } = stubNemis({ cohorts: [{ rows: [ama, bendu, rejected], unenrolledCount: 0 }] });
    const { user } = await renderPage();
    await pickGrade(user);
    const amaRow = await findRow('Ama Kollie');
    expect(within(amaRow).queryByRole('button', { name: 'Discard my change' })).toBeNull();
    expect(within(rowOf('Comfort Doe')).getByRole('button', { name: 'Discard my change' })).toBeInTheDocument();
    expect(screen.getByText(/recorded outcome for that student, if any, reappears after the next full sync/)).toBeInTheDocument();

    await user.click(within(rowOf('Bendu Sirleaf')).getByRole('button', { name: 'Discard my change' }));
    await waitFor(() => expect(discard).toHaveBeenCalledWith('y1', BENDU));
    await waitFor(() => expect(cohort).toHaveBeenCalledTimes(2));
  });

  it('explains when the device has no academic years', async () => {
    const { cohort } = stubNemis({ years: [] });
    await renderPage();
    expect(await screen.findByText(/There are no academic years on this device/)).toBeInTheDocument();
    expect(cohort).not.toHaveBeenCalled();
  });

  it('explains an empty cohort', async () => {
    stubNemis({ cohorts: [{ rows: [], unenrolledCount: 0 }] });
    const { user } = await renderPage();
    await pickGrade(user);
    expect(await screen.findByText('No students were enrolled in this grade that year.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save outcomes' })).toBeNull();
  });

  it('reads another academic year’s cohort when the year changes', async () => {
    const { cohort } = stubNemis();
    const { user } = await renderPage();
    await pickGrade(user);
    await findRow('Ama Kollie');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Academic year' }), 'y0');
    await waitFor(() => expect(cohort).toHaveBeenCalledWith('y0', 'GRADE_7'));
  });
});
