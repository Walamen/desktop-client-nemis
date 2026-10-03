import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { onTransfersChanged } from '@/lib/transfers';
import { TransfersInboxPage } from './TransfersInboxPage';

// Multi-step form walks; under a parallel run they can exceed the 5s default.
vi.setConfig({ testTimeout: 20_000 });

const US = 'inst-1';
const PAST = '2020-01-01T00:00:00.000Z';
const FUTURE = '2999-01-01T00:00:00.000Z';

const school = {
  id: US, code: 'S1', name: 'Test School', type: 'PUBLIC', ownership: 'GOVERNMENT',
  approvalStatus: 'APPROVED', isApproved: true,
};
const currentYear = {
  id: 'y1', institutionId: US, code: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-31',
  isCurrent: true, status: 'ACTIVE', termCount: 1, classCount: 2,
};
const term1 = {
  id: 't1', academicYearId: 'y1', name: 'Term 1', sequence: 1, startDate: '2025-09-01', endDate: '2025-12-15', isCurrent: true,
};
const jss1a = { id: 'c1', academicYearId: 'y1', name: 'JSS1-A', gradeLevel: 'GRADE_7', isActive: true, subjectCount: 0 };
const jss2a = { ...jss1a, id: 'c8', name: 'JSS2-A', gradeLevel: 'GRADE_8' };

type Row = Record<string, unknown>;
const base = (over: Row): Row => ({
  status: 'PENDING', initiatedBy: 'ORIGIN_SCHOOL', lapsesAt: null, classId: null, termId: null,
  toGradeLevel: 'GRADE_7', reason: 'Family moved', reviewNotes: null, requestedDate: '2026-09-20',
  reviewedAt: null, createdAt: '2026-09-20T10:00:00.000Z', fromInstitutionName: 'Other School',
  toInstitutionName: 'Test School', ...over,
});

/** A push sent to us that still needs a class and term. */
const pushToUs = base({
  id: 'tr-push', studentId: 's1', fromInstitutionId: 'inst-2', toInstitutionId: US,
  studentName: 'Ama Kollie', studentNemisId: '482915736045',
});
/** A push sent to us whose class and term are already stored. */
const pushPlaced = base({
  id: 'tr-placed', studentId: 's2', fromInstitutionId: 'inst-2', toInstitutionId: US,
  studentName: 'Bendu Sirleaf', studentNemisId: '111122223333', classId: 'c1', termId: 't1',
  createdAt: '2026-09-19T10:00:00.000Z',
});
/** Another school is pulling one of ours (not yet lapsed). */
const pullFromUs = base({
  id: 'tr-pull', studentId: 's3', fromInstitutionId: US, toInstitutionId: 'inst-3', initiatedBy: 'RECEIVING_SCHOOL',
  lapsesAt: FUTURE, classId: 'c9', termId: 't9', studentName: 'Comfort Doe', studentNemisId: '222233334444',
  fromInstitutionName: 'Test School', toInstitutionName: 'Third School', createdAt: '2026-09-18T10:00:00.000Z',
});
/** Our own pull, lapsed: ready to complete. */
const ourLapsed = base({
  id: 'tr-lapsed', studentId: 's4', fromInstitutionId: 'inst-2', toInstitutionId: US, initiatedBy: 'RECEIVING_SCHOOL',
  lapsesAt: PAST, classId: 'c1', termId: 't1', studentName: 'Dawit Kamara', studentNemisId: '333344445555',
  createdAt: '2026-09-17T10:00:00.000Z',
});
/** Our own push, pending. */
const ourPush = base({
  id: 'tr-ours', studentId: 's5', fromInstitutionId: US, toInstitutionId: 'inst-3', studentName: 'Esther Weah',
  studentNemisId: '444455556666', fromInstitutionName: 'Test School', toInstitutionName: 'Third School',
  createdAt: '2026-09-16T10:00:00.000Z',
});
const decidedOld = base({
  id: 'tr-old-decided', studentId: 's6', fromInstitutionId: 'inst-2', toInstitutionId: US, status: 'APPROVED',
  reviewedAt: '2026-08-01T10:00:00.000Z', studentName: 'Fatu Older', studentNemisId: null,
  createdAt: '2026-07-01T10:00:00.000Z',
});
const decidedNew = base({
  id: 'tr-new-decided', studentId: 's7', fromInstitutionId: US, toInstitutionId: 'inst-3', status: 'REJECTED',
  reviewedAt: '2026-09-01T10:00:00.000Z', studentName: 'Gbessay Newer', studentNemisId: null,
  createdAt: '2026-08-15T10:00:00.000Z',
});

const ALL_ROWS = [pushToUs, pushPlaced, pullFromUs, ourLapsed, ourPush, decidedOld, decidedNew];

type Stubs = {
  rows?: Row[];
  review?: (req: unknown) => Promise<unknown>;
  cancel?: (id: string) => Promise<unknown>;
  create?: (req: unknown) => Promise<unknown>;
  claim?: (req: unknown) => Promise<unknown>;
};

function stubNemis(stubs: Stubs = {}) {
  const rows = stubs.rows ?? ALL_ROWS;
  const list = vi.fn(async () => ({ items: rows, total: rows.length }));
  const review = vi.fn(stubs.review ?? (async () => ({ data: { id: 'x' }, refreshed: true })));
  const cancel = vi.fn(stubs.cancel ?? (async () => ({ data: { id: 'x' }, refreshed: true })));
  const create = vi.fn(stubs.create ?? (async () => ({ data: { id: 'new' }, refreshed: true })));
  const searchSchools = vi.fn(async () => [
    { id: US, name: 'Test School', code: 'S1' },
    { id: 'inst-3', name: 'Third School', code: 'S3' },
  ]);
  const claim = vi.fn(stubs.claim ?? (async () => ({ data: { studentId: 's4' }, refreshed: true })));
  const studentList = vi.fn(async () => ({
    items: [{ id: 's5', fullName: 'Esther Weah', nemisId: '444455556666', gender: 'FEMALE', isActive: true, updatedAt: '' }],
    total: 1, limit: 20, offset: 0,
  }));
  (window as unknown as { nemis: unknown }).nemis = {
    school: { getSummary: vi.fn(async () => school) },
    academicYear: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => [currentYear]) },
    term: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => [term1]) },
    classes: { list: vi.fn(async () => ({ items: [jss1a, jss2a], total: 2 })) },
    schoolAdmin: { list },
    transfer: { review, cancel, create, searchSchools },
    registry: { claim },
    student: { list: studentList },
  };
  return { list, review, cancel, create, searchSchools, claim, studentList };
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
      <TransfersInboxPage />
    </PresentationProvider>,
  );
  await screen.findByRole('tab', { name: /Requests to us/ });
  return { user, layer, ...view };
}

type User = ReturnType<typeof userEvent.setup>;

const rowOf = (name: string) => screen.getByRole('listitem', { name: `Transfer of ${name}` });
const findRow = (name: string) => screen.findByRole('listitem', { name: `Transfer of ${name}` });
const buttonsIn = (el: HTMLElement) => within(el).queryAllByRole('button').map((b) => b.textContent);

function selectNear(labelPattern: RegExp, root: ParentNode = document): HTMLSelectElement {
  const label = Array.from(root.querySelectorAll('label')).find((l) => labelPattern.test(l.textContent ?? ''));
  const select = label?.parentElement?.querySelector('select');
  if (!(select instanceof HTMLSelectElement)) throw new Error(`Expected a <select> near label matching ${labelPattern}`);
  return select;
}

async function pickClassAndTerm(user: User, classId = 'c1') {
  await waitFor(() => expect(selectNear(/^class/i).querySelector(`option[value="${classId}"]`)).not.toBeNull());
  await user.selectOptions(selectNear(/^class/i), classId);
  await waitFor(() => expect(selectNear(/^term/i).querySelector('option[value="t1"]')).not.toBeNull());
  await user.selectOptions(selectNear(/^term/i), 't1');
}

describe('TransfersInboxPage', () => {
  it('splits rows into tabs by who asked, counts pending decisions, and orders History newest first', async () => {
    stubNemis();
    const { user } = await renderPage();

    const toUsTab = screen.getByRole('tab', { name: /Requests to us/ });
    // pushToUs, pushPlaced, pullFromUs are pending decisions; ourLapsed is ours.
    expect(within(toUsTab).getByText('3')).toBeInTheDocument();
    expect(toUsTab).toHaveAttribute('aria-selected', 'true');

    await findRow('Ama Kollie');
    expect(rowOf('Bendu Sirleaf')).toBeInTheDocument();
    expect(rowOf('Comfort Doe')).toBeInTheDocument();
    expect(screen.queryByRole('listitem', { name: 'Transfer of Dawit Kamara' })).toBeNull();
    expect(screen.queryByRole('listitem', { name: 'Transfer of Fatu Older' })).toBeNull();

    await user.click(screen.getByRole('tab', { name: 'Our requests' }));
    expect(rowOf('Dawit Kamara')).toBeInTheDocument();
    expect(rowOf('Esther Weah')).toBeInTheDocument();
    expect(within(rowOf('Dawit Kamara')).getByText('Lapsed — ready to complete')).toBeInTheDocument();
    expect(screen.queryByRole('listitem', { name: 'Transfer of Ama Kollie' })).toBeNull();

    await user.click(screen.getByRole('tab', { name: 'History' }));
    const items = screen.getAllByRole('listitem').map((li) => li.getAttribute('aria-label'));
    expect(items).toEqual(['Transfer of Gbessay Newer', 'Transfer of Fatu Older']);
  });

  it('shows each row its own actions and its details', async () => {
    stubNemis();
    const { user } = await renderPage();

    const ama = await findRow('Ama Kollie');
    expect(buttonsIn(ama)).toEqual(['Approve', 'Reject']);
    expect(within(ama).getByText('4829-1573-6045')).toBeInTheDocument();
    expect(within(ama).getByText(/Other School/)).toBeInTheDocument();
    expect(within(ama).getByText(/Family moved/)).toBeInTheDocument();
    expect(within(ama).getByText('Pending')).toBeInTheDocument();
    expect(buttonsIn(rowOf('Bendu Sirleaf'))).toEqual(['Approve', 'Reject']);
    expect(buttonsIn(rowOf('Comfort Doe'))).toEqual(['Release', 'Reject']);
    expect(within(rowOf('Comfort Doe')).getByText(/Third School/)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Our requests' }));
    expect(buttonsIn(rowOf('Dawit Kamara'))).toEqual(['Complete', 'Withdraw']);
    expect(buttonsIn(rowOf('Esther Weah'))).toEqual(['Cancel']);

    await user.click(screen.getByRole('tab', { name: 'History' }));
    expect(buttonsIn(rowOf('Gbessay Newer'))).toEqual([]);
  });

  it('Approve on a row without placement requires class and term and sends them', async () => {
    const { review, list } = stubNemis();
    const changed = vi.fn();
    const off = onTransfersChanged(changed);
    const { user } = await renderPage();

    const ama = await findRow('Ama Kollie');
    await user.click(within(ama).getByRole('button', { name: 'Approve' }));
    const confirm = () => within(rowOf('Ama Kollie')).getByRole('button', { name: 'Confirm approval' });
    expect(confirm()).toBeDisabled();
    await pickClassAndTerm(user);
    await user.type(within(rowOf('Ama Kollie')).getByLabelText('Review notes'), 'Welcome');
    expect(confirm()).toBeEnabled();
    const loadsBefore = list.mock.calls.length;
    await user.click(confirm());

    await waitFor(() =>
      expect(review).toHaveBeenCalledWith({
        id: 'tr-push', status: 'APPROVED', reviewNotes: 'Welcome', classId: 'c1', termId: 't1',
      }),
    );
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(loadsBefore));
    expect(changed).toHaveBeenCalled();
    off();
  });

  it('Approve on a row with placement sends neither class nor term', async () => {
    const { review } = stubNemis();
    const { user } = await renderPage();

    const bendu = await findRow('Bendu Sirleaf');
    await user.click(within(bendu).getByRole('button', { name: 'Approve' }));
    expect(within(rowOf('Bendu Sirleaf')).queryByText(/^Class/)).toBeNull();
    await user.click(within(rowOf('Bendu Sirleaf')).getByRole('button', { name: 'Confirm approval' }));
    await waitFor(() => expect(review).toHaveBeenCalledTimes(1));
    expect(review.mock.calls[0]?.[0]).toStrictEqual({ id: 'tr-placed', status: 'APPROVED' });
  });

  it('Reject sends no class or term and is never gated on placement', async () => {
    const { review } = stubNemis();
    const { user } = await renderPage();

    const ama = await findRow('Ama Kollie');
    await user.click(within(ama).getByRole('button', { name: 'Reject' }));
    const confirm = within(rowOf('Ama Kollie')).getByRole('button', { name: 'Confirm rejection' });
    expect(confirm).toBeEnabled();
    await user.type(within(rowOf('Ama Kollie')).getByLabelText('Review notes'), 'No space');
    await user.click(confirm);
    await waitFor(() => expect(review).toHaveBeenCalledTimes(1));
    expect(review.mock.calls[0]?.[0]).toStrictEqual({ id: 'tr-push', status: 'REJECTED', reviewNotes: 'No space' });
  });

  it('Release approves with no placement; Cancel and Withdraw cancel the request', async () => {
    const { review, cancel } = stubNemis();
    const { user } = await renderPage();

    const comfort = await findRow('Comfort Doe');
    await user.click(within(comfort).getByRole('button', { name: 'Release' }));
    await user.click(within(rowOf('Comfort Doe')).getByRole('button', { name: 'Confirm release' }));
    await waitFor(() => expect(review).toHaveBeenCalledTimes(1));
    expect(review.mock.calls[0]?.[0]).toStrictEqual({ id: 'tr-pull', status: 'APPROVED' });

    await user.click(screen.getByRole('tab', { name: 'Our requests' }));
    await user.click(within(rowOf('Esther Weah')).getByRole('button', { name: 'Cancel' }));
    await user.click(within(rowOf('Esther Weah')).getByRole('button', { name: 'Confirm cancellation' }));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith('tr-ours'));

    await user.click(within(rowOf('Dawit Kamara')).getByRole('button', { name: 'Withdraw' }));
    await user.click(within(rowOf('Dawit Kamara')).getByRole('button', { name: 'Confirm withdrawal' }));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith('tr-lapsed'));
  });

  it('Complete sends the row NEMIS ID, the entered date of birth, class, term and grade', async () => {
    const { claim } = stubNemis();
    const { user } = await renderPage();

    await user.click(screen.getByRole('tab', { name: 'Our requests' }));
    await user.click(within(rowOf('Dawit Kamara')).getByRole('button', { name: 'Complete' }));
    const row = rowOf('Dawit Kamara');
    const confirm = within(row).getByRole('button', { name: 'Confirm completion' });
    expect(confirm).toBeDisabled();
    await user.type(within(row).getByLabelText('Date of birth'), '2014-03-02');
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    await waitFor(() =>
      expect(claim).toHaveBeenCalledWith({
        nemisId: '333344445555', dateOfBirth: '2014-03-02', classId: 'c1', termId: 't1', gradeLevel: 'GRADE_7',
      }),
    );
  });

  it('Complete is unavailable with an explanation when the row has no NEMIS ID', async () => {
    const { claim } = stubNemis({ rows: [{ ...ourLapsed, studentNemisId: null }] });
    const { user } = await renderPage();
    await user.click(screen.getByRole('tab', { name: 'Our requests' }));
    const row = await findRow('Dawit Kamara');
    expect(within(row).getByRole('button', { name: 'Complete' })).toBeDisabled();
    expect(within(row).getByText(/no NEMIS ID on this device/)).toBeInTheDocument();
    expect(claim).not.toHaveBeenCalled();
  });

  it('a server refusal is shown on the row and the form keeps its inputs', async () => {
    stubNemis({
      review: async () => {
        throw new Error('[REMOTE_REJECTED] The selected term is not in the current academic year.');
      },
    });
    const { user } = await renderPage();

    const ama = await findRow('Ama Kollie');
    await user.click(within(ama).getByRole('button', { name: 'Approve' }));
    await pickClassAndTerm(user);
    await user.type(within(rowOf('Ama Kollie')).getByLabelText('Review notes'), 'Welcome');
    await user.click(within(rowOf('Ama Kollie')).getByRole('button', { name: 'Confirm approval' }));

    const row = rowOf('Ama Kollie');
    expect(await within(row).findByText('The selected term is not in the current academic year.')).toBeInTheDocument();
    expect(selectNear(/^class/i, row).value).toBe('c1');
    expect(selectNear(/^term/i, row).value).toBe('t1');
    expect(within(row).getByLabelText('Review notes')).toHaveValue('Welcome');
    expect(within(row).getByRole('button', { name: 'Confirm approval' })).toBeEnabled();
  });

  it('refreshed: false shows the sync note', async () => {
    stubNemis({ review: async () => ({ data: { id: 'tr-placed' }, refreshed: false }) });
    const { user } = await renderPage();

    const bendu = await findRow('Bendu Sirleaf');
    await user.click(within(bendu).getByRole('button', { name: 'Approve' }));
    await user.click(within(rowOf('Bendu Sirleaf')).getByRole('button', { name: 'Confirm approval' }));
    expect(await screen.findByText('Saved — this will appear once this device syncs.')).toBeInTheDocument();
  });

  it('offline: rows render, every action and New transfer are disabled, and the search is never called', async () => {
    const { searchSchools } = stubNemis();
    const { user } = await renderPage({ online: false });

    expect(screen.getByText('Connect to the internet to act on transfers.')).toBeInTheDocument();
    const ama = await findRow('Ama Kollie');
    for (const b of within(ama).getAllByRole('button')) expect(b).toBeDisabled();
    for (const b of within(rowOf('Comfort Doe')).getAllByRole('button')) expect(b).toBeDisabled();
    expect(screen.getByRole('button', { name: 'New transfer' })).toBeDisabled();

    await user.click(screen.getByRole('tab', { name: 'Our requests' }));
    for (const b of within(rowOf('Dawit Kamara')).getAllByRole('button')) expect(b).toBeDisabled();
    expect(searchSchools).not.toHaveBeenCalled();
  });

  it('a row from an older server (no display fields) renders with id fallbacks', async () => {
    stubNemis({
      rows: [{
        id: 'tr-legacy', studentId: 's-legacy', fromInstitutionId: 'inst-9', toInstitutionId: US,
        status: 'PENDING', initiatedBy: 'ORIGIN_SCHOOL', reason: 'Moved',
      }],
    });
    await renderPage();

    const row = await findRow('s-legacy');
    expect(within(row).getByText(/inst-9/)).toBeInTheDocument();
    expect(row.textContent).not.toMatch(/undefined|null/);
    expect(buttonsIn(row)).toEqual(['Approve', 'Reject']);
  });

  it('New transfer sends createTransfer with the chosen student, school and reason', async () => {
    const { create, searchSchools, studentList } = stubNemis();
    const { user } = await renderPage();

    await user.click(screen.getByRole('button', { name: 'New transfer' }));
    const form = screen.getByRole('form', { name: 'New transfer' });
    await user.type(within(form).getByLabelText('Find student'), 'Esther');
    await user.click(within(form).getByRole('button', { name: 'Find' }));
    await waitFor(() => expect(studentList).toHaveBeenCalledWith(expect.objectContaining({ keyword: 'Esther' })));
    await waitFor(() => expect(selectNear(/^student/i, form).querySelector('option[value="s5"]')).not.toBeNull());
    await user.selectOptions(selectNear(/^student/i, form), 's5');

    // One character is not enough to search.
    await user.type(within(form).getByLabelText('Search schools'), 'T');
    expect(within(form).getByRole('button', { name: 'Search' })).toBeDisabled();
    await user.type(within(form).getByLabelText('Search schools'), 'h');
    await user.click(within(form).getByRole('button', { name: 'Search' }));
    expect(searchSchools).toHaveBeenCalledWith('Th');
    await waitFor(() =>
      expect(selectNear(/^destination school/i, form).querySelector('option[value="inst-3"]')).not.toBeNull(),
    );
    // Our own school is never offered.
    expect(selectNear(/^destination school/i, form).querySelector(`option[value="${US}"]`)).toBeNull();
    await user.selectOptions(selectNear(/^destination school/i, form), 'inst-3');

    const send = within(form).getByRole('button', { name: 'Send transfer request' });
    expect(send).toBeDisabled();
    await user.type(within(form).getByLabelText('Reason'), 'Family relocating');
    expect(send).toBeEnabled();
    await user.click(send);

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({ studentId: 's5', toInstitutionId: 'inst-3', reason: 'Family relocating' }),
    );
  });
});
