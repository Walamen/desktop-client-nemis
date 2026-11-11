import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

let online = true;
vi.mock('@/lib/presentation/hooks/shared', async (orig) => {
  const actual = await orig<typeof import('@/lib/presentation/hooks/shared')>();
  return {
    ...actual,
    useConnectivityStore: () => ({
      store: { getState: () => ({ isOnline: online }), subscribe: () => () => {}, getInitialState: () => ({ isOnline: online }) },
    }),
  };
});

import { SchoolUsersPage } from './SchoolUsersPage';
import { clearNemis, officeUser, renderWithToasts, stubSchoolUsers, usersResult } from './school-users-test-support';

const OFFLINE_BANNER = "You're offline. These are the accounts saved on this device. Changes need a connection.";
const OFFLINE_NOTE = 'Connect to the internet to add or change office accounts.';
const SERVER_ERROR_BANNER =
  "The server couldn't be reached. These are the accounts saved on this device. Changes need a connection.";
const DISABLE_COPY =
  'Ada Kollie will be signed out of NEMIS the next time their device connects. You can enable the account again later.';
const SAVED_TOAST =
  'Saved. A signed-in desktop picks up the change the next time it reconnects, or when the person signs in again.';

const card = (name: string) => screen.getByRole('article', { name });

beforeEach(() => {
  online = true;
});
afterEach(() => {
  clearNemis();
  vi.restoreAllMocks();
});

describe('SchoolUsersPage', () => {
  it('lists admin and office staff with module labels', async () => {
    stubSchoolUsers(usersResult({
      users: [
        usersResult().users[0]!,
        officeUser({ id: 'u-bm', firstName: 'Joe', lastName: 'Weah', title: 'Business Manager', modules: ['FINANCE_PAYMENTS', 'FINANCE_RULES'] }),
        officeUser({ isActive: false }),
      ],
    }));
    await renderWithToasts(<SchoolUsersPage />);

    const admin = within(await screen.findByRole('article', { name: 'Musu Sirleaf' }));
    expect(admin.getByText('School Admin')).toBeInTheDocument();
    expect(admin.getByText('principal@school.lr')).toBeInTheDocument();
    expect(admin.getByText('Never signed in')).toBeInTheDocument();
    expect(admin.queryByRole('button')).toBeNull();

    const bm = within(card('Joe Weah'));
    expect(bm.getByText('School Office Staff')).toBeInTheDocument();
    expect(bm.getByText('Business Manager')).toBeInTheDocument();
    expect(bm.getByText('Record payments')).toBeInTheDocument();
    expect(bm.getByText('Fee rules & payment plans')).toBeInTheDocument();
    expect(bm.getByText('Active')).toBeInTheDocument();
    expect(bm.getByRole('button', { name: 'Edit' })).toBeEnabled();
    expect(bm.getByRole('button', { name: 'Disable' })).toBeEnabled();

    const ada = within(card('Ada Kollie'));
    expect(ada.getByText('Students & families')).toBeInTheDocument();
    expect(ada.getByText('Disabled')).toBeInTheDocument();
    expect(ada.getByText(/^Last sign-in /)).toBeInTheDocument();
    expect(ada.getByRole('button', { name: 'Enable' })).toBeEnabled();

    expect(screen.getByRole('button', { name: /Add office user/ })).toBeEnabled();
    expect(screen.queryByText(OFFLINE_BANNER)).toBeNull();
    expect(screen.queryByText(OFFLINE_NOTE)).toBeNull();
  });

  it('device source shows the offline banner and disables Add, Edit and Disable', async () => {
    online = false;
    stubSchoolUsers(usersResult({ source: 'device' }));
    await renderWithToasts(<SchoolUsersPage />);

    expect(await screen.findByText(OFFLINE_BANNER)).toBeInTheDocument();
    expect(screen.queryByText(SERVER_ERROR_BANNER)).toBeNull();
    expect(screen.getByText(OFFLINE_NOTE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add office user/ })).toBeDisabled();
    const ada = within(card('Ada Kollie'));
    expect(ada.getByRole('button', { name: 'Edit' })).toBeDisabled();
    expect(ada.getByRole('button', { name: 'Disable' })).toBeDisabled();
  });

  it('a device list while the app thinks it is online says the server could not be reached', async () => {
    stubSchoolUsers(usersResult({ source: 'device' }));
    await renderWithToasts(<SchoolUsersPage />);
    expect(await screen.findByText(SERVER_ERROR_BANNER)).toBeInTheDocument();
    expect(screen.queryByText(OFFLINE_BANNER)).toBeNull();
    expect(screen.getByRole('button', { name: /Add office user/ })).toBeDisabled();
  });

  it('disable calls setActive({ userId, isActive: false }) then reloads', async () => {
    const api = stubSchoolUsers();
    await renderWithToasts(<SchoolUsersPage />);
    fireEvent.click(within(await screen.findByRole('article', { name: 'Ada Kollie' })).getByRole('button', { name: 'Disable' }));
    expect(screen.getByText(DISABLE_COPY)).toBeInTheDocument();
    expect(screen.queryByText('This user will immediately lose access to their portal.')).toBeNull();
    fireEvent.change(screen.getByPlaceholderText('DISABLE'), { target: { value: 'DISABLE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Disable Account' }));

    await waitFor(() => expect(api.setActive).toHaveBeenCalledWith({ userId: 'u-staff', isActive: false }));
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(SAVED_TOAST)).toBeInTheDocument();
  });

  it('enable calls setActive({ userId, isActive: true }) without a confirmation', async () => {
    const api = stubSchoolUsers(usersResult({ users: [officeUser({ isActive: false })] }));
    await renderWithToasts(<SchoolUsersPage />);
    fireEvent.click(within(await screen.findByRole('article', { name: 'Ada Kollie' })).getByRole('button', { name: 'Enable' }));
    await waitFor(() => expect(api.setActive).toHaveBeenCalledWith({ userId: 'u-staff', isActive: true }));
    expect(await screen.findByText(SAVED_TOAST)).toBeInTheDocument();
  });

  it('shows a refused command as an error', async () => {
    const api = stubSchoolUsers(usersResult({ users: [officeUser({ isActive: false })] }));
    api.setActive.mockRejectedValueOnce(new Error('[FORBIDDEN] This action is only available to the School Admin.'));
    await renderWithToasts(<SchoolUsersPage />);
    fireEvent.click(within(await screen.findByRole('article', { name: 'Ada Kollie' })).getByRole('button', { name: 'Enable' }));
    expect(await screen.findByText('This action is only available to the School Admin.')).toBeInTheDocument();
    expect(api.list).toHaveBeenCalledTimes(1);
  });
});
