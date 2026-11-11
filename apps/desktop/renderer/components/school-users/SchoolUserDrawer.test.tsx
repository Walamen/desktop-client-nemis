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
import { SchoolUserDrawer } from './SchoolUserDrawer';
import { clearNemis, officeUser, renderWithToasts, stubSchoolUsers, usersResult } from './school-users-test-support';

const PASSWORD = 'Temp-Pass-123';

const checkbox = (label: string) => screen.getByRole('checkbox', { name: label }) as HTMLInputElement;
const ticked = () =>
  (screen.getAllByRole('checkbox') as HTMLInputElement[]).filter((c) => c.checked).map((c) => c.getAttribute('aria-label') ?? c.labels?.[0]?.textContent);

async function renderCreateDrawer(onCreated = vi.fn()) {
  stubSchoolUsers();
  await renderWithToasts(
    <SchoolUserDrawer
      isOpen
      user={null}
      linkableStaff={usersResult().linkableStaff}
      canChange
      onClose={vi.fn()}
      onCreated={onCreated}
      onUpdated={vi.fn()}
    />,
  );
}

function fillNames(email = 'new@school.lr') {
  fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Sia' } });
  fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Kamara' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
}

beforeEach(() => {
  online = true;
});
afterEach(() => {
  clearNemis();
  vi.restoreAllMocks();
});

describe('SchoolUserDrawer', () => {
  it('Registrar preset ticks Students & families and fills the title', async () => {
    await renderCreateDrawer();
    fireEvent.change(screen.getByLabelText('Preset'), { target: { value: 'REGISTRAR' } });
    expect(ticked()).toEqual(['Students & families']);
    expect(screen.getByLabelText('Title')).toHaveValue('Registrar');
  });

  it('Business Manager preset ticks both finance modules', async () => {
    await renderCreateDrawer();
    fireEvent.click(checkbox('Reports'));
    fireEvent.change(screen.getByLabelText('Preset'), { target: { value: 'BUSINESS_MANAGER' } });
    expect(ticked()).toEqual(['Record payments', 'Fee rules & payment plans']);
    expect(screen.getByLabelText('Title')).toHaveValue('Business Manager');
  });

  it('a preset keeps a title the admin already typed', async () => {
    await renderCreateDrawer();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Clerk' } });
    fireEvent.change(screen.getByLabelText('Preset'), { target: { value: 'REGISTRAR' } });
    expect(screen.getByLabelText('Title')).toHaveValue('Clerk');
  });

  it('shows one checkbox per module, labelled', async () => {
    await renderCreateDrawer();
    expect(screen.getAllByRole('checkbox')).toHaveLength(8);
    expect(checkbox('Academic setup')).toBeInTheDocument();
    expect(checkbox('School settings')).toBeInTheDocument();
  });

  it('submit is blocked with no module ticked', async () => {
    const onCreated = vi.fn();
    await renderCreateDrawer(onCreated);
    fillNames();
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Tick at least one module.')).toBeInTheDocument();
    const nemis = (window as unknown as { nemis: { schoolUsers: { create: ReturnType<typeof vi.fn> } } }).nemis;
    expect(nemis.schoolUsers.create).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('blocks a bad email and a 61-character title', async () => {
    await renderCreateDrawer();
    fillNames('not-an-email');
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'x'.repeat(61) } });
    fireEvent.click(checkbox('Reports'));
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Title must be 60 characters or fewer.')).toBeInTheDocument();
  });

  it('sends a trimmed create with the linked staff member', async () => {
    const onCreated = vi.fn();
    await renderCreateDrawer(onCreated);
    const nemis = (window as unknown as { nemis: { schoolUsers: { create: ReturnType<typeof vi.fn> } } }).nemis;
    nemis.schoolUsers.create.mockResolvedValue({ data: { user: officeUser() }, refreshed: true });
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: '  Sia ' } });
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Kamara' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'sia@school.lr' } });
    fireEvent.change(screen.getByLabelText('Preset'), { target: { value: 'REGISTRAR' } });
    fireEvent.change(screen.getByLabelText('Link to an existing staff member'), { target: { value: 'st-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() =>
      expect(nemis.schoolUsers.create).toHaveBeenCalledWith({
        firstName: 'Sia', lastName: 'Kamara', email: 'sia@school.lr', title: 'Registrar', modules: ['STUDENTS'], staffId: 'st-1',
      }),
    );
    expect(onCreated).toHaveBeenCalled();
  });

  it('shows the server refusal', async () => {
    await renderCreateDrawer();
    const nemis = (window as unknown as { nemis: { schoolUsers: { create: ReturnType<typeof vi.fn> } } }).nemis;
    nemis.schoolUsers.create.mockRejectedValue(new Error('[CONFLICT] A user with this email already exists.'));
    fillNames();
    fireEvent.click(checkbox('Reports'));
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('A user with this email already exists.')).toBeInTheDocument();
  });

  it('edit hides email and staff link and sends only the changes the form holds', async () => {
    stubSchoolUsers();
    const nemis = (window as unknown as { nemis: { schoolUsers: { update: ReturnType<typeof vi.fn> } } }).nemis;
    const onUpdated = vi.fn();
    await renderWithToasts(
      <SchoolUserDrawer isOpen user={officeUser()} linkableStaff={[]} canChange onClose={vi.fn()} onCreated={vi.fn()} onUpdated={onUpdated} />,
    );
    expect(screen.queryByLabelText('Email')).toBeNull();
    expect(screen.queryByLabelText('Link to an existing staff member')).toBeNull();
    expect(ticked()).toEqual(['Students & families']);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '' } });
    fireEvent.click(checkbox('Reports'));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(nemis.schoolUsers.update).toHaveBeenCalledWith({
        userId: 'u-staff', firstName: 'Ada', lastName: 'Kollie', title: null, modules: ['STUDENTS', 'REPORTS'],
      }),
    );
    expect(onUpdated).toHaveBeenCalled();
  });

  it('create with a credential shows the credential panel; Done clears it', async () => {
    const api = stubSchoolUsers();
    api.create.mockResolvedValue({
      data: { user: officeUser({ firstName: 'Sia', lastName: 'Kamara', email: 'sia@school.lr' }), credential: { email: 'sia@school.lr', defaultPassword: PASSWORD } },
      refreshed: true,
    });
    await renderWithToasts(<SchoolUsersPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Add office user/ }));
    fillNames('sia@school.lr');
    fireEvent.click(checkbox('Reports'));
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    const panel = within(await screen.findByRole('region', { name: 'Sign-in details' }));
    expect(panel.getByText('Share these sign-in details with Sia Kamara. They are shown only once.')).toBeInTheDocument();
    expect(panel.getByText('sia@school.lr')).toBeInTheDocument();
    expect(panel.getByText(PASSWORD)).toBeInTheDocument();
    expect(panel.getByRole('button', { name: 'Copy email' })).toBeInTheDocument();
    expect(panel.getByRole('button', { name: 'Copy password' })).toBeInTheDocument();
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));

    fireEvent.click(panel.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('region', { name: 'Sign-in details' })).toBeNull();
    expect(screen.queryByText(PASSWORD)).toBeNull();
  });

  it('create without a credential shows the existing-password toast', async () => {
    const api = stubSchoolUsers();
    api.create.mockResolvedValue({ data: { user: officeUser({ firstName: 'Kofi', lastName: 'Doe' }) }, refreshed: true });
    await renderWithToasts(<SchoolUsersPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Add office user/ }));
    fillNames('kofi@school.lr');
    fireEvent.click(checkbox('Reports'));
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Kofi Doe can now sign in with their existing password.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Sign-in details' })).toBeNull();
  });
});
