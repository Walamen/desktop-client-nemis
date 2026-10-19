import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import UserManagementPage from './page';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

const user = (id: string, extra: Record<string, unknown> = {}) => ({
  id, firstName: 'Musu', lastName: `Kollie-${id}`, email: `${id}@moe.gov.lr`, phoneNumber: '0770111222',
  photoUrl: null, role: 'DEO', isActive: true, emailVerified: true, lastLoginAt: null,
  districtId: 'd-1', districtName: 'Buchanan', institutionId: null, schoolName: null, ...extra,
});

const ROWS = [
  user('u-1'),
  user('u-2', {
    role: 'INSTITUTION_ADMIN', emailVerified: false, isActive: false, districtId: null, districtName: null,
    institutionId: 's-1', schoolName: 'Buchanan High',
  }),
  user('u-3', { emailVerified: null, districtId: null, districtName: null }),
];

function mockNemis(overrides: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  const county = {
    listUsers: vi.fn<(query: { page: number }) => Promise<unknown>>(async () => ({
      county: { id: 'county-1', name: 'Grand Bassa' },
      stats: { totalUsers: 21, activeUsers: 7, pendingActivation: 3, schoolAdmins: 9 },
      data: ROWS,
      total: 3,
      ...extra,
    })),
    getUserOptions: vi.fn(async () => ({
      county: { id: 'county-1', name: 'Grand Bassa' },
      districts: [{ id: 'd-1', name: 'Buchanan' }],
      schools: [{ id: 's-1', name: 'Buchanan High', districtId: 'd-1' }],
    })),
    setUserActive: vi.fn(async () => ({ data: null, refreshed: true })),
    assignUser: vi.fn(async () => ({ data: null, refreshed: true })),
    getActivationLink: vi.fn(async () => ({
      data: { activationUrl: 'https://nemis.example/activate?token=abc' },
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
  render(
    <PresentationProvider layer={layer}>
      <UserManagementPage />
    </PresentationProvider>,
  );
}

const card = (label: string) => screen.getByText(label, { selector: 'p' }).parentElement!.textContent;
const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;
const loaded = () => waitFor(() => expect(screen.getByText('Musu Kollie-u-1')).toBeInTheDocument());

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  push.mockClear();
});

describe('County Administrative Users page', () => {
  it('renders the header and the four stat cards', async () => {
    mockNemis();
    renderPage();
    await loaded();
    expect(screen.getByText('Grand Bassa')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'User Management' })).toBeInTheDocument();
    expect(card('Total Users')).toContain('21');
    expect(card('Total Users')).toContain('DEOs and School Admins');
    expect(card('Active Users')).toContain('7');
    expect(card('Active Users')).toContain('Last 30 days');
    expect(card('Pending Activation')).toContain('3');
    expect(card('Pending Activation')).toContain('Not verified');
    expect(card('School Admins')).toContain('9');
    expect(card('School Admins')).toContain('Institutions');
    expect(screen.getByText('3', { selector: 'span' }).parentElement!.textContent).toContain('3 users found');
  });

  it('shows cards by default (role, scope line) and a table after "Table view"', async () => {
    mockNemis();
    renderPage();
    await loaded();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getAllByText('DEO', { selector: 'span' })).toHaveLength(2);
    expect(screen.getByText('School Admin', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('Buchanan', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('Buchanan High', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('County Level', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Table view' }));
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(rowOf('Musu Kollie-u-1').textContent).toContain('Never');
    expect(rowOf('Musu Kollie-u-2').textContent).toContain('Buchanan High');
    fireEvent.click(screen.getByRole('button', { name: 'Card view' }));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('search and role go to the query, back on page 1', async () => {
    const county = mockNemis({}, { total: 13 });
    renderPage();
    await loaded();
    const last = () => county.listUsers.mock.calls.at(-1)![0];
    expect(last()).toEqual({ page: 1, limit: 12 });
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    await waitFor(() => expect(last()).toMatchObject({ page: 2, limit: 12 }));
    fireEvent.change(screen.getByPlaceholderText('Name or email…'), { target: { value: 'musu' } });
    await waitFor(() => expect(last()).toMatchObject({ search: 'musu', page: 1, limit: 12 }));
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    await waitFor(() => expect(last()).toMatchObject({ page: 2 }));
    fireEvent.click(screen.getByRole('button', { name: 'School Admin' }));
    await waitFor(() =>
      expect(last()).toEqual({ search: 'musu', role: 'INSTITUTION_ADMIN', page: 1, limit: 12 }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    await waitFor(() => expect(last()).not.toHaveProperty('role'));
  });

  it('the pager goes to page 2 when total is 13', async () => {
    const county = mockNemis({}, { total: 13 });
    renderPage();
    await waitFor(() => expect(screen.getByText('Page 1 of 2')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(county.listUsers.mock.calls.at(-1)![0]).toMatchObject({ page: 2, limit: 12 }));
  });

  it('navigates to Create User and Bulk Create', async () => {
    mockNemis();
    renderPage();
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Create User' }));
    expect(push).toHaveBeenCalledWith('/government/county/users/create');
    fireEvent.click(screen.getByRole('button', { name: 'Bulk Create' }));
    expect(push).toHaveBeenCalledWith('/government/county/users/create/bulk');
  });

  it('Activation URL shows only for emailVerified === false and opens the returned link', async () => {
    const county = mockNemis();
    renderPage();
    await loaded();
    const buttons = screen.getAllByRole('button', { name: 'Activation URL' });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]!);
    await waitFor(() =>
      expect(screen.getByText('https://nemis.example/activate?token=abc')).toBeInTheDocument(),
    );
    expect(county.getActivationLink).toHaveBeenCalledWith('u-2');
    expect(screen.getByRole('heading', { name: 'Activation Link' })).toBeInTheDocument();
    expect(screen.getByText('u-2@moe.gov.lr', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText(/Share this link securely with Musu Kollie-u-2/)).toBeInTheDocument();
    expect(screen.queryByText('abc')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('https://nemis.example/activate?token=abc')).not.toBeInTheDocument();
  });

  it('labels Re-assign for an assigned user and Assign otherwise, and assigns through the modal', async () => {
    const county = mockNemis();
    renderPage();
    await loaded();
    expect(screen.getAllByRole('button', { name: 'Re-assign' })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
    const dialog = screen.getByRole('heading', { name: 'Assign Musu Kollie-u-3' }).closest('.relative') as HTMLElement;
    // A DEO defaults to a district assignment with role DEO.
    const [districtSelect, roleSelect] = within(dialog).getAllByRole('combobox');
    await waitFor(() => expect(within(dialog).getByRole('option', { name: 'Buchanan' })).toBeInTheDocument());
    expect((roleSelect as HTMLSelectElement).value).toBe('DEO');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Assign User' }));
    expect(within(dialog).getByText('Please select a district')).toBeInTheDocument();
    fireEvent.change(districtSelect!, { target: { value: 'd-1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Assign User' }));
    await waitFor(() =>
      expect(county.assignUser).toHaveBeenCalledWith({ userId: 'u-3', role: 'DEO', districtId: 'd-1' }),
    );
    await waitFor(() => expect(screen.queryByText('Assign Musu Kollie-u-3')).not.toBeInTheDocument());
  });

  it('assigns to an institution with School Admin', async () => {
    const county = mockNemis();
    renderPage();
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
    const dialog = screen.getByRole('heading', { name: 'Assign Musu Kollie-u-3' }).closest('.relative') as HTMLElement;
    fireEvent.click(within(dialog).getByRole('button', { name: /Institution/ }));
    const [schoolSelect, roleSelect] = within(dialog).getAllByRole('combobox');
    fireEvent.change(schoolSelect!, { target: { value: 's-1' } });
    fireEvent.change(roleSelect!, { target: { value: 'INSTITUTION_ADMIN' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Assign User' }));
    await waitFor(() =>
      expect(county.assignUser).toHaveBeenCalledWith({
        userId: 'u-3', role: 'INSTITUTION_ADMIN', institutionId: 's-1',
      }),
    );
  });

  it('Disable opens the confirm modal and runs on confirm; Enable runs at once', async () => {
    const county = mockNemis();
    renderPage();
    await loaded();
    fireEvent.click(within(rowCard('Musu Kollie-u-1')).getByRole('button', { name: 'Disable' }));
    expect(screen.getByText('Disable User Account')).toBeInTheDocument();
    expect(county.setUserActive).not.toHaveBeenCalled();
    const confirmButton = screen.getByRole('button', { name: 'Disable Account' });
    expect(confirmButton).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('DISABLE'), { target: { value: 'DISABLE' } });
    fireEvent.click(confirmButton);
    await waitFor(() => expect(county.setUserActive).toHaveBeenCalledWith({ userId: 'u-1', isActive: false }));
    await waitFor(() => expect(screen.queryByText('Disable User Account')).not.toBeInTheDocument());

    const loadsBefore = county.listUsers.mock.calls.length;
    fireEvent.click(within(rowCard('Musu Kollie-u-2')).getByRole('button', { name: 'Enable' }));
    await waitFor(() => expect(county.setUserActive).toHaveBeenCalledWith({ userId: 'u-2', isActive: true }));
    await waitFor(() => expect(county.listUsers.mock.calls.length).toBeGreaterThan(loadsBefore));
  });

  it('offline: every action button is disabled, the hint shows, the list still renders', async () => {
    mockNemis();
    renderPage(false);
    await loaded();
    expect(screen.getByText('User changes need an internet connection.')).toBeInTheDocument();
    expect(card('Total Users')).toContain('21');
    for (const name of ['Bulk Create', 'Create User', 'Activation URL', 'Re-assign', 'Assign', 'Disable', 'Enable']) {
      for (const b of screen.getAllByRole('button', { name })) expect(b).toBeDisabled();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Table view' }));
    for (const name of ['Activation URL', 'Re-assign', 'Assign', 'Disable', 'Enable']) {
      for (const b of screen.getAllByRole('button', { name })) expect(b).toBeDisabled();
    }
  });

  it('a rejected command shows the parsed message in a banner', async () => {
    mockNemis({
      setUserActive: vi.fn(async () => {
        throw new Error('[FORBIDDEN] You can only manage users in your county.');
      }),
      getActivationLink: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    renderPage();
    await loaded();
    fireEvent.click(within(rowCard('Musu Kollie-u-2')).getByRole('button', { name: 'Enable' }));
    await waitFor(() =>
      expect(screen.getByText('You can only manage users in your county.')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Activation URL' }));
    await waitFor(() =>
      expect(
        screen.getByText('No active activation token found. The token may have expired.'),
      ).toBeInTheDocument(),
    );
  });

  it('shows the sync note when the follow-up pull did not run', async () => {
    mockNemis({ setUserActive: vi.fn(async () => ({ data: null, refreshed: false })) });
    renderPage();
    await loaded();
    fireEvent.click(within(rowCard('Musu Kollie-u-2')).getByRole('button', { name: 'Enable' }));
    await waitFor(() =>
      expect(screen.getByText('Saved — this will appear once this device syncs.')).toBeInTheDocument(),
    );
  });

  it('shows the web empty state', async () => {
    mockNemis({}, { data: [], total: 0 });
    renderPage();
    await waitFor(() => expect(screen.getByText('No users found matching your criteria.')).toBeInTheDocument());
    expect(screen.queryByText(/^Page /)).not.toBeInTheDocument();
  });
});

/** A user card: the closest bordered card around the name. */
function rowCard(name: string): HTMLElement {
  return screen.getByText(name).closest('.rounded-lg') as HTMLElement;
}
