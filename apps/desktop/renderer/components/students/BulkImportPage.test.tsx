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

const SYNC_NOTE = 'Student login becomes available after this record syncs.';
const OFFLINE_REASON = 'Needs a connection — import these rows again when online. Keep the NEMIS IDs.';

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
}

function stubNemis(stubs: Stubs = {}) {
  const createAndEnroll = vi.fn(stubs.createAndEnroll ?? (async () => studentView('123456789012')));
  const bulkClaim = vi.fn(
    stubs.bulkClaim ??
      (async () => ({ data: { created: [], failed: [], registryUnavailableMessage: null }, refreshed: true })),
  );
  (window as unknown as { nemis: unknown }).nemis = {
    school: { getSummary: vi.fn(async () => school) },
    academicYear: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => [currentYear]) },
    term: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => [term1]) },
    classes: { list: vi.fn(async () => ({ items: [jss1a], total: 1 })) },
    registry: { bulkClaim },
    student: { createAndEnroll },
  };
  return { createAndEnroll, bulkClaim };
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
function sheetRow(firstName: string, { grade = 'GRADE_7', nemisId = '', admission = '2026-09-01' } = {}): string[] {
  return [
    firstName, 'Kollie', '2014-03-02', 'FEMALE', admission, grade, nemisId,
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
  await screen.findByText('Batch placement');
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

async function pickBatch(user: User) {
  await user.selectOptions(selectNear(/^grade/i), 'GRADE_7');
  await waitFor(() => expect(selectNear(/^class/i).querySelector('option[value="c1"]')).not.toBeNull());
  await user.selectOptions(selectNear(/^class/i), 'c1');
  await waitFor(() => expect(selectNear(/^term/i).querySelector('option[value="t1"]')).not.toBeNull());
  await user.selectOptions(selectNear(/^term/i), 't1');
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
  it('Import is disabled until grade, class and term are chosen', async () => {
    stubNemis();
    const { user } = await renderPage();
    await upload(user, [sheetRow('Ama')]);

    expect(importButtons().every((b) => b.disabled)).toBe(true);
    await user.selectOptions(selectNear(/^grade/i), 'GRADE_7');
    expect(importButtons().every((b) => b.disabled)).toBe(true);
    await waitFor(() => expect(selectNear(/^class/i).querySelector('option[value="c1"]')).not.toBeNull());
    await user.selectOptions(selectNear(/^class/i), 'c1');
    expect(importButtons().every((b) => b.disabled)).toBe(true);
    await waitFor(() => expect(selectNear(/^term/i).querySelector('option[value="t1"]')).not.toBeNull());
    await user.selectOptions(selectNear(/^term/i), 't1');
    await waitFor(() => expect(importButtons().every((b) => !b.disabled)).toBe(true));
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
    await pickBatch(user);
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
    const claimRequest = bulkClaim.mock.calls[0]?.[0] as { classId: string; academicYearId: string; termId: string; students: { nemisId: string; firstName: string }[] };
    expect(claimRequest).toMatchObject({ classId: 'c1', academicYearId: 'y1', termId: 't1' });
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
      within(entryFor('Row 5')).getByText('Grade level "GRADE_8" does not match the selected class grade "GRADE_7"'),
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
    await screen.findByText('Batch placement');
    const names = Array.from(document.querySelectorAll('input[placeholder="First name"]'))
      .map((i) => (i as HTMLInputElement).value)
      .filter((v) => v !== 'Musu');
    expect(names).toEqual(['Cece', 'Efua']);
  });

  it('a grade-mismatch row fails with the server-worded message and is never sent', async () => {
    const { bulkClaim, createAndEnroll } = stubNemis();
    const { user } = await renderPage();
    await upload(user, [sheetRow('Efua', { grade: 'GRADE_8', nemisId: generateNemisId() })]);
    await pickBatch(user);
    await runImport(user);

    expect(bulkClaim).not.toHaveBeenCalled();
    expect(createAndEnroll).not.toHaveBeenCalled();
    expect(
      within(entryFor('Row 1')).getByText('Grade level "GRADE_8" does not match the selected class grade "GRADE_7"'),
    ).toBeInTheDocument();
  });

  it('offline: no bulk claim; NEMIS-ID rows go to retry with the offline copy; local rows are still created', async () => {
    const { bulkClaim, createAndEnroll } = stubNemis();
    const { user } = await renderPage({ online: false });
    await upload(user, [sheetRow('Ama'), sheetRow('Bola', { nemisId: generateNemisId() })]);
    await pickBatch(user);
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
    await pickBatch(user);
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
    await pickBatch(user);
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
    await pickBatch(user);
    await runImport(user);

    expect(screen.getByText('Saved — claimed students will appear once this device syncs.')).toBeInTheDocument();
    expectNoSecrets();
  });
});
