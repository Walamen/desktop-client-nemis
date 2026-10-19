import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import Page from './page';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const HEADER = 'firstName,lastName,email,phoneNumber,role,districtId,institutionId';
const CLEAN = `${HEADER}\nMusu,Kollie,musu@moe.gov.lr,+231770555111,DEO,d-1,\nJane,Smith,jane@moe.gov.lr,+231770234567,INSTITUTION_ADMIN,,s-1`;

function mockNemis(overrides: Record<string, unknown> = {}) {
  const county = {
    getUserOptions: vi.fn(async () => ({
      county: { id: 'county-1', name: 'Grand Bassa' },
      districts: [{ id: 'd-1', name: 'Buchanan' }],
      schools: [{ id: 's-1', name: 'Buchanan High', districtId: 'd-1' }],
    })),
    bulkCreateUsers: vi.fn<(rows: unknown) => Promise<unknown>>(async () => ({
      data: {
        succeeded: [
          { email: 'musu@moe.gov.lr', name: 'Musu Kollie', activationUrl: 'https://nemis.example/activate?token=a' },
          { email: 'jane@moe.gov.lr', name: 'Jane Smith', activationUrl: null },
        ],
        failed: [{ email: '', error: 'Phone already registered' }],
      },
      refreshed: true,
    })),
    ...overrides,
  };
  (window as unknown as { nemis: unknown }).nemis = { county };
  return county;
}

function renderPage(online = true) {
  const layer = createRendererPresentation();
  layer.stores.connectivity.setOnline(online);
  const view = render(
    <PresentationProvider layer={layer}>
      <Page />
    </PresentationProvider>,
  );
  return view;
}

function upload(container: HTMLElement, text: string) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File([text], 'users.csv', { type: 'text/csv' })] } });
}

const createButton = () => screen.getByRole('button', { name: /Create \d+ Users/ });

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  push.mockClear();
  vi.restoreAllMocks();
});

describe('County Bulk Create users page', () => {
  it('renders the web header, the county and the three steps', async () => {
    mockNemis();
    renderPage();
    expect(screen.getByRole('heading', { name: 'Bulk Create Users' })).toBeInTheDocument();
    expect(screen.getByText('Upload a CSV file to create multiple users at once.')).toBeInTheDocument();
    for (const t of ['Import users', 'Verify data', 'View outcome']) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
    await waitFor(() => expect(screen.getByText('Grand Bassa')).toBeInTheDocument());
    expect(screen.getByText('Click to upload CSV file')).toBeInTheDocument();
  });

  it('downloads the web template', () => {
    mockNemis();
    const createObjectURL = vi.fn(() => 'blob:template');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Download Template/ }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect((clickSpy.mock.instances[0] as unknown as HTMLAnchorElement).download).toBe('user_import_template.csv');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:template');
  });

  it('shows a parse error on the upload step', async () => {
    mockNemis();
    const { container } = renderPage();
    upload(container, 'firstName,email\nA,a@b.lr');
    expect(await screen.findByText('Missing required columns: lastName, phoneNumber, role')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Upload CSV File' })).toBeInTheDocument();
  });

  it('lists the problems on Preview and blocks Submit (foreign school, repeated email, SUPER_ADMIN)', async () => {
    const county = mockNemis();
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText('Grand Bassa')).toBeInTheDocument());
    upload(
      container,
      `${HEADER}\nMusu,Kollie,musu@moe.gov.lr,+231770555111,INSTITUTION_ADMIN,,school-of-margibi\n` +
        'Jane,Smith,MUSU@moe.gov.lr,+231770234567,DEO,,\nBoss,Man,boss@moe.gov.lr,+231770234568,SUPER_ADMIN,,',
    );
    expect(await screen.findByText('Preview Users (3 users)')).toBeInTheDocument();
    expect(screen.getByText('Row 2: school is not in this county')).toBeInTheDocument();
    expect(screen.getByText('Row 3: email repeats row 2')).toBeInTheDocument();
    expect(screen.getByText('Row 4: role must be DEO or INSTITUTION_ADMIN')).toBeInTheDocument();
    expect(createButton()).toBeDisabled();
    fireEvent.click(createButton());
    expect(county.bulkCreateUsers).not.toHaveBeenCalled();

    // Back returns to the upload step.
    fireEvent.click(screen.getByRole('button', { name: /Back$/ }));
    expect(screen.getByRole('heading', { name: 'Upload CSV File' })).toBeInTheDocument();
  });

  it('sends a clean file and renders the results', async () => {
    const county = mockNemis();
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText('Grand Bassa')).toBeInTheDocument());
    upload(container, CLEAN);
    expect(await screen.findByText('Preview Users (2 users)')).toBeInTheDocument();
    expect(screen.getByText('Musu Kollie')).toBeInTheDocument();
    expect(createButton()).toHaveTextContent('Create 2 Users');
    expect(createButton()).toBeEnabled();
    fireEvent.click(createButton());

    expect(await screen.findByRole('heading', { name: 'Bulk User Creation Results' })).toBeInTheDocument();
    expect(county.bulkCreateUsers).toHaveBeenCalledWith([
      {
        firstName: 'Musu',
        lastName: 'Kollie',
        email: 'musu@moe.gov.lr',
        phoneNumber: '+231770555111',
        role: 'DEO',
        districtId: 'd-1',
      },
      {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@moe.gov.lr',
        phoneNumber: '+231770234567',
        role: 'INSTITUTION_ADMIN',
        institutionId: 's-1',
      },
    ]);
    expect(screen.getByText('Created Successfully')).toBeInTheDocument();
    expect(screen.getByText('Successfully Created Users')).toBeInTheDocument();
    expect(screen.getByText('https://nemis.example/activate?token=a')).toBeInTheDocument();
    expect(screen.getAllByTitle('Copy')).toHaveLength(1);
    // One for the null URL, one for the failed row whose email the server left out.
    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(screen.getByText('Failed Users')).toBeInTheDocument();
    expect(screen.getByText('Phone already registered')).toBeInTheDocument();
    expect(screen.queryByText('Saved — this will appear once this device syncs.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(push).toHaveBeenCalledWith('/government/county/users');
  });

  it('shows the sync note when the follow-up pull did not run', async () => {
    mockNemis({
      bulkCreateUsers: vi.fn(async () => ({
        data: { succeeded: [{ email: 'musu@moe.gov.lr', name: 'Musu Kollie', activationUrl: null }], failed: [] },
        refreshed: false,
      })),
    });
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText('Grand Bassa')).toBeInTheDocument());
    upload(container, CLEAN);
    fireEvent.click(await screen.findByRole('button', { name: /Create 2 Users/ }));
    expect(await screen.findByText('Saved — this will appear once this device syncs.')).toBeInTheDocument();
  });

  it('shows the server error and stays on Preview when the call fails', async () => {
    mockNemis({ bulkCreateUsers: vi.fn(async () => Promise.reject(new Error('[OFFLINE] Server unreachable'))) });
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText('Grand Bassa')).toBeInTheDocument());
    upload(container, CLEAN);
    fireEvent.click(await screen.findByRole('button', { name: /Create 2 Users/ }));
    expect(await screen.findByText('Server unreachable')).toBeInTheDocument();
    expect(screen.getByText('Preview Users (2 users)')).toBeInTheDocument();
  });

  it('offline: Submit is disabled with the hint', async () => {
    const county = mockNemis();
    const { container } = renderPage(false);
    expect(screen.getByText('User changes need an internet connection.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Grand Bassa')).toBeInTheDocument());
    upload(container, CLEAN);
    expect(await screen.findByText('Preview Users (2 users)')).toBeInTheDocument();
    expect(createButton()).toBeDisabled();
    fireEvent.click(createButton());
    expect(county.bulkCreateUsers).not.toHaveBeenCalled();
  });
});
