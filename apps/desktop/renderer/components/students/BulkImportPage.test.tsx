import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as XLSX from 'xlsx';
import { formatNemisId, generateNemisId } from '@nemis-desktop/shared';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { BulkImportPage } from './BulkImportPage';
import { HEADERS } from './bulk-import/bulk-import-logic';

const { push, downloadRetryFile } = vi.hoisted(() => ({ push: vi.fn(), downloadRetryFile: vi.fn() }));
// Uploading, picking and importing walk many fields; under a parallel run
// they can exceed the 5s default without anything being wrong.
vi.setConfig({ testTimeout: 20_000 });

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('./bulk-import/bulk-import-logic', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./bulk-import/bulk-import-logic')>()),
  downloadRetryFile,
}));

const school = {
  id: 'inst-1', code: 'S1', name: 'Test School', type: 'PUBLIC', ownership: 'GOVERNMENT',
  approvalStatus: 'APPROVED', isApproved: true,
};
const currentYear = {
  id: 'y1', institutionId: 'inst-1', code: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-31',
  isCurrent: true, status: 'ACTIVE', termCount: 1, classCount: 1,
};
const term1 = {
  id: 't1', academicYearId: 'y1', name: 'Term 1', sequence: 1, startDate: '2025-09-01', endDate: '2025-12-15', isCurrent: true,
};
const jss1a = { id: 'c1', academicYearId: 'y1', name: 'JSS1-A', gradeLevel: 'GRADE_7', isActive: true, subjectCount: 0 };
const jss2a = { id: 'c2', academicYearId: 'y1', name: 'JSS2-A', gradeLevel: 'GRADE_8', isActive: true, subjectCount: 0 };
const jss1b = { id: 'c3', academicYearId: 'y1', name: 'JSS1-B', gradeLevel: 'GRADE_7', isActive: true, subjectCount: 0 };

const SYNC_NOTE = 'Student login becomes available after this record syncs.';
const OFFLINE_REASON = 'Needs a connection — import these rows again when online. Keep the NEMIS IDs.';
const NO_PARENT_LOGIN = "No guardian email — the guardian won't get a parent login.";
const parentLoginNote = (email: string) =>
  `Parent login for ${email} is set up after this record syncs, unless that email already belongs to a student's login.`;
const guardianEmailInputs = () =>
  Array.from(document.querySelectorAll('input[placeholder="guardian@email.com"]')) as HTMLInputElement[];

let created = 0;
function studentView(nemisId: string) {
  created += 1;
  return {
    id: `s-${created}`, institutionId: 'inst-1', firstName: 'X', lastName: 'Y', fullName: 'X Y', nemisId,
    dateOfBirth: '2014-01-01', gender: 'FEMALE', isActive: true, version: 1, updatedAt: '2026-10-01T00:00:00.000Z',
    guardians: [],
  };
}

interface Stubs {
  createAndEnroll?: (request: unknown) => Promise<unknown>;
  bulkClaim?: (request: unknown) => Promise<unknown>;
  classes?: (request: unknown) => Promise<unknown>;
  years?: unknown[];
}

function stubNemis(stubs: Stubs = {}) {
  const createAndEnroll = vi.fn(stubs.createAndEnroll ?? (async () => studentView('123456789012')));
  const bulkClaim = vi.fn(
    stubs.bulkClaim ??
      (async () => ({ data: { created: [], failed: [], registryUnavailableMessage: null }, refreshed: true })),
  );
  const classesList = vi.fn(stubs.classes ?? (async () => ({ items: [jss1a], total: 1 })));
  (window as unknown as { nemis: unknown }).nemis = {
    school: { getSummary: vi.fn(async () => school) },
    academicYear: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => stubs.years ?? [currentYear]) },
    term: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => [term1]) },
    classes: { list: classesList },
    registry: { bulkClaim },
    student: { createAndEnroll },
  };
  return { createAndEnroll, bulkClaim, classesList };
}

beforeEach(() => {
  push.mockReset();
  downloadRetryFile.mockReset();
  created = 0;
});
afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

type User = ReturnType<typeof userEvent.setup>;

async function renderPage({ online = true }: { online?: boolean } = {}) {
  const layer = createRendererPresentation();
  await layer.bootstrap.run();
  if (!online) layer.stores.connectivity.setOnline(false);
  const user = userEvent.setup({ delay: null });
  render(
    <PresentationProvider layer={layer}>
      <BulkImportPage />
    </PresentationProvider>,
  );
  await screen.findByText('Step 1 — Download Template');
  return { user, layer };
}

/** One spreadsheet row: name, grade and NEMIS ID vary; everything else is valid. */
function sheetRow(
  firstName: string,
  { grade = 'GRADE_7', klass = '', nemisId = '', admission = '2026-09-01' } = {},
): string[] {
  return [
    firstName, 'Kollie', '2014-03-02', 'FEMALE', admission, grade, klass, nemisId,
    'Musu', 'Kollie', 'Mother', '+231770000000', `${firstName.toLowerCase()}@example.com`,
  ];
}

async function upload(user: User, rows: string[][]) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADERS, ...rows]), 'Students');
  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const file = new File([bytes], 'students.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('no file input');
  await user.upload(input, file);
  await screen.findByRole('heading', { name: 'Enrollment' });
}

function selectNear(labelPattern: RegExp): HTMLSelectElement {
  const label = Array.from(document.querySelectorAll('label')).find((l) => labelPattern.test(l.textContent ?? ''));
  const select = label?.parentElement?.querySelector('select');
  if (!(select instanceof HTMLSelectElement)) throw new Error(`Expected a <select> near label matching ${labelPattern}`);
  return select;
}

function importButtons(): HTMLButtonElement[] {
  return screen.getAllByRole('button', { name: /^Import \d+/ }) as HTMLButtonElement[];
}

async function pickTerm(user: User) {
  await waitFor(() => expect(selectNear(/^term/i).querySelector('option[value="t1"]')).not.toBeNull());
  await user.selectOptions(selectNear(/^term/i), 't1');
}

/** The Class select of a review row (1-based). */
function classSelect(row: number): HTMLSelectElement {
  return screen.getByRole('combobox', { name: `Class for row ${row}` }) as HTMLSelectElement;
}

async function runImport(user: User) {
  await user.click(importButtons()[0]!);
  await screen.findByRole('heading', { name: 'Import results' });
}

/** The results entry (li) that names this row. */
function entryFor(rowLabel: string): HTMLElement {
  const li = screen.getByText(rowLabel).closest('li');
  if (!li) throw new Error(`no entry for ${rowLabel}`);
  return li;
}

function expectNoSecrets() {
  const text = (document.body.textContent ?? '').toLowerCase();
  expect(text).not.toContain('password');
  expect(text).not.toContain('credential');
}

describe('BulkImportPage', () => {
  it('auto-picks the only class of the row grade; Import waits for a term', async () => {
    stubNemis();
    const { user } = await renderPage();
    await upload(user, [sheetRow('Ama')]);

    await waitFor(() => expect(classSelect(1).value).toBe('c1'));
    expect(importButtons().every((b) => b.disabled)).toBe(true);
    await pickTerm(user);
    await waitFor(() => expect(importButtons().every((b) => !b.disabled)).toBe(true));
  });

  it('a mixed-grade file imports each row into its own class', async () => {
    const id = generateNemisId();
    const { createAndEnroll, bulkClaim } = stubNemis({
      classes: async () => ({ items: [jss1a, jss2a], total: 2 }),
      bulkClaim: async () => ({ data: { created: [{ index: 0, nemisId: id }], failed: [], registryUnavailableMessage: null }, refreshed: true }),
    });
    const { user } = await renderPage();
    await upload(user, [
      sheetRow('Ama', { grade: 'GRADE_7' }),
      sheetRow('Bola', { grade: 'GRADE_8' }),
      sheetRow('Cece', { grade: 'GRADE_8', nemisId: id }),
    ]);
    await pickTerm(user);
    await runImport(user);

    expect(createAndEnroll.mock.calls.map((c) => (c[0] as { classId: string }).classId)).toEqual(['c1', 'c2']);
    const claim = bulkClaim.mock.calls[0]?.[0] as { students: { classId: string }[] };
    expect(claim).not.toHaveProperty('classId');
    expect(claim.students.map((s) => s.classId)).toEqual(['c2']);
  });

  it('a grade with several classes asks for a pick; picking enables Import', async () => {
    const { createAndEnroll } = stubNemis({ classes: async () => ({ items: [jss1a, jss1b], total: 2 }) });
    const { user } = await renderPage();
    await upload(user, [sheetRow('Ama')]);
    await pickTerm(user);

    expect(await screen.findByText('Pick a class')).toBeInTheDocument();
    expect(importButtons()[0]).toHaveTextContent('Import 0 Students');
    await user.selectOptions(classSelect(1), 'c3');
    await waitFor(() => expect(importButtons().every((b) => !b.disabled)).toBe(true));
    await runImport(user);
    expect((createAndEnroll.mock.calls[0]?.[0] as { classId: string }).classId).toBe('c3');
  });

  it("matches the file's Class column, and flags a name that matches no class", async () => {
    stubNemis({ classes: async () => ({ items: [jss1a, jss1b], total: 2 }) });
    const { user } = await renderPage();
    await upload(user, [sheetRow('Ama', { klass: 'jss1-b' }), sheetRow('Bola', { klass: '7Z' })]);

    await waitFor(() => expect(classSelect(1).value).toBe('c3'));
    expect(screen.getByText('No GRADE 7 class named "7Z" — pick one')).toBeInTheDocument();
    expect(importButtons()[0]).toHaveTextContent('Import 1 Student');
  });

  it('changing a row grade drops its class and re-resolves for the new grade', async () => {
    stubNemis({ classes: async () => ({ items: [jss1a, jss2a], total: 2 }) });
    const { user } = await renderPage();
    await upload(user, [sheetRow('Ama')]);
    await waitFor(() => expect(classSelect(1).value).toBe('c1'));

    const gradeSelect = classSelect(1).closest('tr')!.querySelectorAll('select')[1] as HTMLSelectElement;
    await user.selectOptions(gradeSelect, 'GRADE_8');
    await waitFor(() => expect(classSelect(1).value).toBe('c2'));
  });

  it('while classes load: no class errors and Import stays disabled', async () => {
    stubNemis({ classes: () => new Promise(() => {}) });
    const { user } = await renderPage();
    await upload(user, [sheetRow('Ama')]);
    await pickTerm(user);

    expect(screen.getAllByText('Loading…').length).toBeGreaterThan(0);
    expect(screen.queryByText(/create one under Teaching/)).not.toBeInTheDocument();
    expect(importButtons().every((b) => b.disabled)).toBe(true);
    // An error-free row that cannot be imported yet is neutral, not green.
    const statusIcons = document.querySelector('tbody tr')!.querySelectorAll('svg');
    expect(Array.from(statusIcons).some((svg) => svg.classList.contains('text-gray-300'))).toBe(true);
    expect(document.querySelector('tbody svg.text-green-500')).toBeNull();
  });

  it('a failed class load offers Try again, never "create one"; a retry recovers', async () => {
    const { classesList } = stubNemis({ classes: async () => { throw new Error('[DB_ERROR] boom'); } });
    const { user } = await renderPage();
    await upload(user, [sheetRow('Ama')]);
    await pickTerm(user);

    expect(await screen.findByText(/Couldn.t load classes/)).toBeInTheDocument();
    expect(screen.queryByText(/create one under Teaching/)).not.toBeInTheDocument();
    expect(importButtons().every((b) => b.disabled)).toBe(true);

    classesList.mockResolvedValue({ items: [jss1a], total: 1 });
    await user.click(screen.getAllByRole('button', { name: 'Try again' })[0]!);
    await waitFor(() => expect(classSelect(1).value).toBe('c1'));
    await waitFor(() => expect(importButtons().every((b) => !b.disabled)).toBe(true));
  });

  it('with no current academic year the Class cell says so, never "create one", and Import stays disabled', async () => {
    stubNemis({ years: [{ ...currentYear, isCurrent: false }] });
    const { user } = await renderPage();
    await upload(user, [sheetRow('Ama')]);

    expect(await screen.findByText('No current academic year')).toBeInTheDocument();
    expect(screen.queryByText(/create one/)).not.toBeInTheDocument();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    expect(importButtons().every((b) => b.disabled)).toBe(true);
  });

  it.each(['y1', 'y0'])(
    'stale yearClasses of %s from an earlier visit never shows "create one" while the load is in flight',
    async (staleYear) => {
      let release: (v: unknown) => void = () => {};
      stubNemis({ classes: () => new Promise((resolve) => { release = resolve; }) });
      const { user, layer } = await renderPage();
      layer.viewModels.academicFoundation.store.setState({
        yearClasses: { status: 'success', data: [jss1a as never] },
        yearClassesYearId: staleYear,
      });
      await upload(user, [sheetRow('Efua', { grade: 'GRADE_8' })]);
      await screen.findByText('Academic year: 2025/2026');

      expect(screen.queryByText(/create one/)).not.toBeInTheDocument();
      expect(screen.getAllByText('Loading…').length).toBeGreaterThan(0);
      expect(importButtons().every((b) => b.disabled)).toBe(true);

      release({ items: [jss1a, jss2a], total: 2 });
      await waitFor(() => expect(classSelect(1).value).toBe('c2'));
      expect(screen.queryByText(/create one/)).not.toBeInTheDocument();
    },
  );

  it('with the academic year failing to load the Class cell says so, never "create one", and Import stays disabled', async () => {
    stubNemis();
    (window as unknown as { nemis: { academicYear: { list: unknown } } }).nemis.academicYear.list = vi.fn(async () => {
      throw new Error('[DB_ERROR] boom');
    });
    const { user } = await renderPage();
    await upload(user, [sheetRow('Ama')]);

    expect(await screen.findByText('Academic year not loaded')).toBeInTheDocument();
    expect(screen.queryByText(/create one/)).not.toBeInTheDocument();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    expect(importButtons().every((b) => b.disabled)).toBe(true);
  });

  it('a mixed batch online: local creates, one bulk claim of only the NEMIS-ID rows, results by row number', async () => {
    const idB = generateNemisId();
    const idD = generateNemisId();
    const localNemis = '482915736045';
    const { createAndEnroll, bulkClaim } = stubNemis({
      createAndEnroll: vi
        .fn()
        .mockResolvedValueOnce(studentView(localNemis))
        .mockRejectedValueOnce(new Error('[VALIDATION_FAILED] Guardian phone is invalid.')),
      bulkClaim: async () => ({
        data: {
          created: [{ index: 0, nemisId: idB }],
          failed: [{ index: 1, error: 'This student is already enrolled.' }],
          registryUnavailableMessage: null,
        },
        refreshed: true,
      }),
    });
    const { user } = await renderPage();
    await upload(user, [
      sheetRow('Ama', { admission: '2026-09-03' }),
      sheetRow('Bola', { nemisId: idB }),
      sheetRow('Cece'),
      sheetRow('Dede', { nemisId: idD }),
      sheetRow('Efua', { grade: 'GRADE_8', nemisId: generateNemisId() }),
    ]);
    await pickTerm(user);
    await runImport(user);

    expect(createAndEnroll).toHaveBeenCalledTimes(2);
    const first = createAndEnroll.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(first).toMatchObject({
      institutionId: 'inst-1', firstName: 'Ama', academicYearId: 'y1', classId: 'c1', termId: 't1',
      enrollmentDate: '2026-09-03', assertedNoNemisId: false, email: 'ama@example.com',
      guardians: [{ firstName: 'Musu', lastName: 'Kollie', relationship: 'Mother', phoneNumber: '+231770000000', isPrimary: true }],
    });
    expect(first.guardians).toHaveLength(1);

    expect(bulkClaim).toHaveBeenCalledTimes(1);
    const claimRequest = bulkClaim.mock.calls[0]?.[0] as { academicYearId: string; termId: string; students: { nemisId: string; firstName: string }[] };
    expect(claimRequest).toMatchObject({ academicYearId: 'y1', termId: 't1' });
    expect(claimRequest).not.toHaveProperty('classId');
    expect(claimRequest.students.map((s) => (s as unknown as { classId: string }).classId)).toEqual(['c1', 'c1']);
    expect(claimRequest.students.map((s) => s.firstName)).toEqual(['Bola', 'Dede']);
    expect(claimRequest.students.map((s) => s.nemisId)).toEqual([idB, idD]);

    expect(within(entryFor('Row 1')).getByText(formatNemisId(localNemis))).toBeInTheDocument();
    expect(within(entryFor('Row 1')).getByText(SYNC_NOTE)).toBeInTheDocument();
    expect(
      within(entryFor('Row 2')).getByText(`Signs in to the student portal with NEMIS ID ${formatNemisId(idB)}`),
    ).toBeInTheDocument();
    expect(within(entryFor('Row 3')).getByText('Guardian phone is invalid.')).toBeInTheDocument();
    expect(within(entryFor('Row 4')).getByText('This student is already enrolled.')).toBeInTheDocument();
    expect(
      within(entryFor('Row 5')).getByText('Fix before importing: classId: No GRADE 8 class — create one under Teaching → Classes'),
    ).toBeInTheDocument();
    // Counts: Submitted 5, Created 1, Claimed 1, Failed 2, To retry 1.
    expect(within(screen.getByTestId('count-submitted')).getByText('5')).toBeInTheDocument();
    expect(within(screen.getByTestId('count-created')).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByTestId('count-claimed')).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByTestId('count-failed')).getByText('2')).toBeInTheDocument();
    expect(within(screen.getByTestId('count-retry')).getByText('1')).toBeInTheDocument();
    expectNoSecrets();

    // Retry Failed Rows keeps exactly the failed rows (3 and 5), by original index.
    await user.click(screen.getByRole('button', { name: 'Retry Failed Rows' }));
    await screen.findByRole('heading', { name: 'Enrollment' });
    const names = Array.from(document.querySelectorAll('input[placeholder="First name"]'))
      .map((i) => (i as HTMLInputElement).value)
      .filter((v) => v !== 'Musu');
    expect(names).toEqual(['Cece', 'Efua']);
  });

  it('a row whose grade has no class is never sent and says to create one', async () => {
    const { bulkClaim, createAndEnroll } = stubNemis();
    const { user } = await renderPage();
    await upload(user, [sheetRow('Efua', { grade: 'GRADE_8', nemisId: generateNemisId() }), sheetRow('Ama')]);
    expect(await screen.findByText('No GRADE 8 class — create one under Teaching → Classes')).toBeInTheDocument();
    await pickTerm(user);
    await runImport(user);

    expect(bulkClaim).not.toHaveBeenCalled();
    expect(createAndEnroll).toHaveBeenCalledTimes(1);
    expect(
      within(entryFor('Row 1')).getByText('Fix before importing: classId: No GRADE 8 class — create one under Teaching → Classes'),
    ).toBeInTheDocument();
  });

  it('an invalid row is reported as failed and Retry keeps failed rows by original index', async () => {
    const id = generateNemisId();
    const badId = id.slice(0, 11) + String((Number(id[11]) + 1) % 10);
    const { createAndEnroll } = stubNemis({
      createAndEnroll: vi
        .fn()
        .mockResolvedValueOnce(studentView('482915736045'))
        .mockRejectedValueOnce(new Error('[VALIDATION_FAILED] Guardian phone is invalid.')),
    });
    const { user } = await renderPage();
    await upload(user, [sheetRow('Amy', { nemisId: badId }), sheetRow('Bola'), sheetRow('Cece')]);
    await pickTerm(user);
    await waitFor(() => expect(importButtons().every((b) => !b.disabled)).toBe(true));
    await runImport(user);

    expect(createAndEnroll).toHaveBeenCalledTimes(2);
    expect(
      within(entryFor('Row 1')).getByText(/Fix before importing: nemisId: Invalid NEMIS ID/),
    ).toBeInTheDocument();
    expect(within(entryFor('Row 3')).getByText('Guardian phone is invalid.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry Failed Rows' }));
    await screen.findByRole('heading', { name: 'Enrollment' });
    const names = Array.from(document.querySelectorAll('input[placeholder="First name"]'))
      .map((i) => (i as HTMLInputElement).value)
      .filter((v) => v !== 'Musu');
    expect(names).toEqual(['Amy', 'Cece']);
    // Placement survives the retry: Cece is back in her class.
    await waitFor(() => expect(classSelect(2).value).toBe('c1'));
  });

  it('offline: no bulk claim; NEMIS-ID rows go to retry with the offline copy; local rows are still created', async () => {
    const { bulkClaim, createAndEnroll } = stubNemis();
    const { user } = await renderPage({ online: false });
    await upload(user, [sheetRow('Ama'), sheetRow('Bola', { nemisId: generateNemisId() })]);
    await pickTerm(user);
    await runImport(user);

    expect(bulkClaim).not.toHaveBeenCalled();
    expect(createAndEnroll).toHaveBeenCalledTimes(1);
    expect(within(entryFor('Row 2')).getByText(OFFLINE_REASON)).toBeInTheDocument();
    expect(within(entryFor('Row 1')).getByText(SYNC_NOTE)).toBeInTheDocument();
  });

  it('registryUnavailableMessage is shown verbatim and the unattempted rows are offered in the retry file', async () => {
    const message = 'The national student registry is unavailable right now. 1 row was not processed.';
    const idA = generateNemisId();
    const idB = generateNemisId();
    stubNemis({
      bulkClaim: async () => ({
        data: { created: [{ index: 0, nemisId: idA }], failed: [], registryUnavailableMessage: message },
        refreshed: true,
      }),
    });
    const { user } = await renderPage();
    await upload(user, [sheetRow('Ama', { nemisId: idA }), sheetRow('Bola', { nemisId: idB })]);
    await pickTerm(user);
    await runImport(user);

    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('alert').textContent).toBe(message);
    await user.click(screen.getByRole('button', { name: 'Download retry file' }));
    expect(downloadRetryFile).toHaveBeenCalledTimes(1);
    const [rows, retry] = downloadRetryFile.mock.calls[0] as [{ firstName: string }[], unknown];
    expect(rows.map((r) => r.firstName)).toEqual(['Ama', 'Bola']);
    expect(retry).toEqual([{ originalIndex: 1, reason: message }]);
  });

  it('a thrown claim call: message without the code, all claim rows to retry, local creates kept', async () => {
    const message = "Bulk import must target your institution's current academic year.";
    const { createAndEnroll } = stubNemis({
      bulkClaim: async () => {
        throw new Error(`[REMOTE_REJECTED] ${message}`);
      },
    });
    const { user } = await renderPage();
    await upload(user, [
      sheetRow('Ama', { nemisId: generateNemisId() }),
      sheetRow('Bola'),
      sheetRow('Cece', { nemisId: generateNemisId() }),
    ]);
    await pickTerm(user);
    await runImport(user);

    expect(createAndEnroll).toHaveBeenCalledTimes(1);
    expect(within(entryFor('Row 2')).getByText(SYNC_NOTE)).toBeInTheDocument();
    // Shown once, for both rows, and never with the [CODE] prefix.
    expect(screen.getAllByText(message)).toHaveLength(1);
    expect(within(entryFor('Rows 1, 3')).getByText(message)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('REMOTE_REJECTED');
    expect(within(screen.getByTestId('count-retry')).getByText('2')).toBeInTheDocument();
    expectNoSecrets();
  });

  it('refreshed: false shows the sync note', async () => {
    const id = generateNemisId();
    stubNemis({
      bulkClaim: async () => ({
        data: { created: [{ index: 0, nemisId: id }], failed: [], registryUnavailableMessage: null },
        refreshed: false,
      }),
    });
    const { user } = await renderPage();
    await upload(user, [sheetRow('Ama', { nemisId: id })]);
    await pickTerm(user);
    await runImport(user);

    expect(screen.getByText('Saved — claimed students will appear once this device syncs.')).toBeInTheDocument();
    expectNoSecrets();
  });

  it('reads Guardian Email from the file, lets it be edited, and sends it with the guardian', async () => {
    const { createAndEnroll } = stubNemis();
    const { user } = await renderPage();
    await upload(user, [[...sheetRow('Ama'), 'musu@example.com']]);

    expect(screen.getByRole('columnheader', { name: 'Guardian Email' })).toBeInTheDocument();
    expect(guardianEmailInputs().map((i) => i.value)).toEqual(['musu@example.com']);
    await user.clear(guardianEmailInputs()[0]!);
    await user.type(guardianEmailInputs()[0]!, 'musu.k@example.com');
    await pickTerm(user);
    await runImport(user);

    const request = createAndEnroll.mock.calls[0]?.[0] as { guardians: { email?: string }[] };
    expect(request.guardians[0]?.email).toBe('musu.k@example.com');
    expect(within(entryFor('Row 1')).getByText(parentLoginNote('musu.k@example.com'))).toBeInTheDocument();
    expectNoSecrets();
  });

  it('a blank guardian email imports and says the guardian gets no parent login', async () => {
    const { createAndEnroll } = stubNemis();
    const { user } = await renderPage();
    await upload(user, [sheetRow('Ama')]);
    await pickTerm(user);
    await runImport(user);

    const request = createAndEnroll.mock.calls[0]?.[0] as { guardians: { email?: string }[] };
    expect(request.guardians[0]?.email).toBeUndefined();
    expect(within(entryFor('Row 1')).getByText(NO_PARENT_LOGIN)).toBeInTheDocument();
  });

  it('Add Row adds a row with an empty Guardian Email field', async () => {
    stubNemis();
    const { user } = await renderPage();
    await upload(user, [sheetRow('Ama')]);
    await user.click(screen.getAllByRole('button', { name: /Add Row/ })[0]!);
    expect(guardianEmailInputs().map((i) => i.value)).toEqual(['', '']);
  });

  it('a bad guardian email, or one equal to the student email, blocks the row in the grid', async () => {
    stubNemis();
    const { user } = await renderPage();
    await upload(user, [[...sheetRow('Ama'), 'musu@bXc'], [...sheetRow('Bola'), 'bola@example.com']]);

    expect(screen.getByText('Invalid email')).toBeInTheDocument();
    expect(screen.getByText("Can't be the same as the guardian's email")).toBeInTheDocument();
    expect(importButtons()[0]).toHaveTextContent('Import 0 Students');
  });

  it('Step 1 explains guardian email is for new students only', async () => {
    stubNemis();
    await renderPage();
    const help = screen.getByText(/Guardian Email gives the guardian a parent login/);
    expect(help).toHaveTextContent(/unless that email already belongs to a student's login/);
    expect(help).toHaveTextContent(/new students only/);
  });

  it("flags a student email that is another row's guardian email until that row is removed", async () => {
    stubNemis();
    const { user } = await renderPage();
    await upload(user, [[...sheetRow('Ama'), 'family@example.com'], sheetRow('Bola')]);

    const studentInputs = Array.from(
      document.querySelectorAll('input[placeholder="student@email.com"]'),
    ) as HTMLInputElement[];
    const bolaEmail = studentInputs[1]!;
    await user.clear(bolaEmail);
    await user.type(bolaEmail, 'family@example.com');

    expect(screen.getByText("Already used as a guardian's email in row 1")).toBeInTheDocument();
    expect(importButtons()[0]).toHaveTextContent('Import 1 Student');

    await user.click(screen.getAllByTitle('Remove row')[0]!);
    expect(screen.queryByText("Already used as a guardian's email in row 1")).not.toBeInTheDocument();
  });

  it('flags a student email already used by an earlier row until that row is removed', async () => {
    stubNemis();
    const { user } = await renderPage();
    await upload(user, [sheetRow('Ama'), sheetRow('Bola')]);

    const studentInputs = Array.from(
      document.querySelectorAll('input[placeholder="student@email.com"]'),
    ) as HTMLInputElement[];
    await user.clear(studentInputs[1]!);
    await user.type(studentInputs[1]!, 'ama@example.com');

    expect(screen.getByText("Already used as a student's email in row 1")).toBeInTheDocument();
    expect(importButtons()[0]).toHaveTextContent('Import 1 Student');

    await user.click(screen.getAllByTitle('Remove row')[0]!);
    expect(screen.queryByText("Already used as a student's email in row 1")).not.toBeInTheDocument();
    expect(importButtons()[0]).toHaveTextContent('Import 1 Student');
  });
});
