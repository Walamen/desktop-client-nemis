import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as XLSX from 'xlsx';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import Page from './page';

const { push, writeFile } = vi.hoisted(() => ({ push: vi.fn(), writeFile: vi.fn() }));
vi.setConfig({ testTimeout: 20_000 });
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('xlsx', async (importOriginal) => ({ ...(await importOriginal<typeof import('xlsx')>()), writeFile }));

const HEADERS = [
  'School Name *',
  'District Name *',
  'Levels * (PRE_PRIMARY,PRIMARY,SECONDARY)',
  'Principal Name *',
  'Admin Email *',
  'Phone',
  'Address',
  'Ownership (GOVERNMENT/PRIVATE/MISSION/COMMUNITY/NGO)',
  'EMIS Code',
  'Is Urban (YES/NO)',
];
const IDS = ['6f1c2a8e-3b4d-4e5f-9a0b-1c2d3e4f5a6b', '7f1c2a8e-3b4d-4e5f-9a0b-1c2d3e4f5a6b'];
const CONTEXT = { county: { id: 'c-1', name: 'Grand Bassa', code: 'GB' }, districts: [{ id: 'd-1', name: 'Buchanan' }] };
const VALID_ROWS = [
  ['Alpha School', 'Buchanan', 'PRIMARY', 'Ada Doe', 'ada@school.lr', '0771', '1 Road', 'GOVERNMENT', 'LR-1', 'YES'],
  ['Beta School', 'buchanan', 'PRIMARY,SECONDARY', 'Bob Kollie', 'bob@school.lr', '', '', 'PRIVATE', '', 'NO'],
];
const registration = (id: string, syncState: string, extra: Record<string, unknown> = {}) => ({
  id, countyId: 'c-1', source: 'bulk', payload: {}, syncState, syncError: null, principalLogin: null,
  createdAt: 'x', updatedAt: 'x', syncedAt: null, ...extra,
});

function renderWith(county: Record<string, unknown> = {}) {
  const api = {
    getRegistrationContext: vi.fn(async () => CONTEXT),
    registerSchools: vi.fn(async () => ({ status: 'saved', ids: IDS })),
    discardSchoolRegistration: vi.fn(async () => ({ discarded: true })),
    settleSchoolRegistrations: vi.fn(async () => IDS.map((id) => registration(id, 'pending'))),
    ...county,
  };
  (window as unknown as { nemis: unknown }).nemis = { county: api };
  render(
    <PresentationProvider layer={createRendererPresentation()}>
      <Page />
    </PresentationProvider>,
  );
  return api;
}

async function upload(rows: string[][]) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADERS, ...rows]), 'Schools');
  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('no file input');
  await userEvent.setup().upload(input, new File([bytes], 'schools.xlsx'));
  await screen.findByText('with errors', { exact: false });
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  push.mockReset();
  writeFile.mockReset();
});

describe('County Bulk Import Schools', () => {
  it('downloads the web template', async () => {
    renderWith();
    const button = screen.getByRole('button', { name: /Download Template/ });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    const [wb, name] = writeFile.mock.calls[0] as [XLSX.WorkBook, string];
    expect(name).toBe('school-import-template.xlsx');
    expect(wb.SheetNames).toEqual(['Schools', 'Districts', 'Reference']);
    const [headers] = XLSX.utils.sheet_to_json<string[]>(wb.Sheets.Schools!, { header: 1 });
    expect(headers).toEqual(HEADERS);
  });

  it('parses an upload, skips the example row and validates rows', async () => {
    renderWith();
    await screen.findByRole('button', { name: /Download Template/ });
    await upload([
      ['Example High School', 'Buchanan', 'PRIMARY', 'Jane Doe', 'jane@example.com', '', '', '', '', ''],
      VALID_ROWS[0]!,
      ['Gamma School', 'Buchanan', 'PRIMARY', 'Gus Doe', 'jane@school', '', '', '', '', ''],
      ['Delta School', 'Nowhere', 'PRIMARY', 'Dee Doe', 'dee@school.lr', '', '', '', '', ''],
    ]);
    expect(screen.getByDisplayValue('Alpha School')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Example High School')).not.toBeInTheDocument();
    expect(screen.getByText('Invalid email')).toBeInTheDocument();
    expect(screen.getByText('Must match a district in this county')).toBeInTheDocument();
  });

  it('saves valid rows offline and shows the saved-on-device summary', async () => {
    const api = renderWith();
    await screen.findByRole('button', { name: /Download Template/ });
    await upload(VALID_ROWS);
    fireEvent.click(screen.getAllByRole('button', { name: /Import 2/ })[0]!);
    await waitFor(() =>
      expect(screen.getByText("2 schools saved; they'll be sent when you're back online.")).toBeInTheDocument(),
    );
    expect(api.settleSchoolRegistrations).toHaveBeenCalledWith(IDS, 30_000);
    expect(api.registerSchools).toHaveBeenCalledWith({
      source: 'bulk',
      schools: [
        expect.objectContaining({
          name: 'Alpha School', type: 'SCHOOL', levels: ['PRIMARY'], districtId: 'd-1', ownership: 'GOVERNMENT',
          emisCode: 'LR-1', isUrban: true, principalName: 'Ada Doe', isActive: true, address: '1 Road',
          admins: [{ email: 'ada@school.lr', firstName: 'Ada', lastName: 'Doe' }],
          metadata: { principalName: 'Ada Doe', phone: '0771' },
        }),
        expect.objectContaining({ name: 'Beta School', districtId: 'd-1', levels: ['PRIMARY', 'SECONDARY'], ownership: 'PRIVATE' }),
      ],
    });
    expect(screen.queryByText('Created')).not.toBeInTheDocument();
  });

  it('shows created, failed and logins when the server answers within the wait', async () => {
    const api = renderWith({
      settleSchoolRegistrations: vi.fn(async () => [
        registration(IDS[0]!, 'synced', { principalLogin: { email: 'ada@school.lr', password: 'Nemis@123' } }),
        registration(IDS[1]!, 'rejected', { syncError: 'Email taken' }),
      ]),
    });
    await screen.findByRole('button', { name: /Download Template/ });
    await upload(VALID_ROWS);
    fireEvent.click(screen.getAllByRole('button', { name: /Import 2/ })[0]!);
    await waitFor(() => expect(screen.getByText('Admin Login Credentials')).toBeInTheDocument());
    expect(screen.getByText('Nemis@123')).toBeInTheDocument();
    expect(screen.getByText('Email taken')).toBeInTheDocument();
    expect(screen.getByText('Failed Schools')).toBeInTheDocument();
    expect(api.discardSchoolRegistration).toHaveBeenCalledWith(IDS[1]);
  });

  it('Retry Failed Rows returns the refused rows to review', async () => {
    renderWith({
      settleSchoolRegistrations: vi.fn(async () => [
        registration(IDS[0]!, 'synced'),
        registration(IDS[1]!, 'rejected', { syncError: 'Email taken' }),
      ]),
    });
    await screen.findByRole('button', { name: /Download Template/ });
    await upload(VALID_ROWS);
    fireEvent.click(screen.getAllByRole('button', { name: /Import 2/ })[0]!);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry Failed Rows' }));
    await waitFor(() => expect(screen.getByDisplayValue('Beta School')).toBeInTheDocument());
    expect(screen.queryByDisplayValue('Alpha School')).not.toBeInTheDocument();
  });

  it('ignores a second Import click while saving', async () => {
    let release: (value: unknown) => void = () => {};
    const api = renderWith({ registerSchools: vi.fn(() => new Promise((resolve) => (release = resolve))) });
    await screen.findByRole('button', { name: /Download Template/ });
    await upload(VALID_ROWS);
    const button = screen.getAllByRole('button', { name: /Import 2/ })[0]!;
    fireEvent.click(button);
    fireEvent.click(button);
    release({ status: 'saved', ids: IDS });
    await waitFor(() => expect(screen.getByText(/schools saved/)).toBeInTheDocument());
    expect(api.registerSchools).toHaveBeenCalledTimes(1);
  });
});
