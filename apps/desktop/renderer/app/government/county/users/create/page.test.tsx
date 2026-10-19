import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import Page from './page';

const push = vi.fn();
let roleParam: string | null = null;
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => ({ get: (key: string) => (key === 'role' ? roleParam : null) }),
}));

function mockNemis(overrides: Record<string, unknown> = {}) {
  const county = {
    getUserOptions: vi.fn(async () => ({
      county: { id: 'county-1', name: 'Grand Bassa' },
      districts: [{ id: 'd-1', name: 'Buchanan' }],
      schools: [
        { id: 's-1', name: 'Buchanan High', districtId: 'd-1' },
        { id: 's-2', name: 'Compound Elementary', districtId: 'd-1' },
      ],
    })),
    createUser: vi.fn<(request: unknown) => Promise<unknown>>(async () => ({
      data: { userId: 'u-new', activationUrl: 'https://nemis.example/activate?token=xyz' },
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
      <Page />
    </PresentationProvider>,
  );
}

const type = (placeholder: string, value: string) =>
  fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } });
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

function fillBasics() {
  type('John', 'Musu');
  type('Doe', 'Kollie');
  type('+231770123456', '+231770555111');
  type('user@example.com', 'Musu.Kollie@moe.gov.lr');
}

const roleSelect = () => screen.getByDisplayValue('Select a role') as HTMLSelectElement;

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  push.mockClear();
  roleParam = null;
});

describe('County Create User wizard', () => {
  it('renders the web header, the county and the three steps', async () => {
    mockNemis();
    renderPage();
    expect(screen.getByRole('heading', { name: 'Create New User' })).toBeInTheDocument();
    expect(screen.getByText('Add a new user to your county system.')).toBeInTheDocument();
    for (const t of ['User details', 'Role selection', 'Confirm details']) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
    await waitFor(() => expect(screen.getByText('Grand Bassa')).toBeInTheDocument());
    expect(screen.getByText('Activation link will be sent to this email')).toBeInTheDocument();
  });

  it('shows the web validation messages and blocks Next on step 1', () => {
    mockNemis();
    renderPage();
    click(/Next/);
    expect(screen.getByText('First name is required')).toBeInTheDocument();
    expect(screen.getByText('Last name is required')).toBeInTheDocument();
    expect(screen.getByText('Phone number is required')).toBeInTheDocument();
    expect(screen.getByText('Invalid email address')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('John')).toBeInTheDocument();

    type('John', 'x'.repeat(101));
    type('+231770123456', '0770123456');
    type('user@example.com', 'not-an-email');
    click(/Next/);
    expect(screen.getByText('First name is too long')).toBeInTheDocument();
    expect(
      screen.getByText('Invalid phone number format (use international format, e.g., +231770123456)'),
    ).toBeInTheDocument();
    expect(screen.getByText('Invalid email address')).toBeInTheDocument();
  });

  it('navigates Next and Previous between the steps', () => {
    mockNemis();
    renderPage();
    fillBasics();
    click(/Next/);
    expect(screen.getByRole('heading', { name: 'Role & Assignment' })).toBeInTheDocument();
    expect(screen.getByText('County admins can create DEOs and School Admins')).toBeInTheDocument();

    click(/Next/);
    expect(screen.getByText('Please select a valid role')).toBeInTheDocument();

    fireEvent.change(roleSelect(), { target: { value: 'DEO' } });
    expect(screen.getByText(/DEOs are created without a district assignment/)).toBeInTheDocument();
    click(/Next/);
    expect(screen.getByRole('heading', { name: 'Review & Submit' })).toBeInTheDocument();
    expect(screen.getByText('Musu Kollie')).toBeInTheDocument();
    expect(screen.getByText('musu.kollie@moe.gov.lr')).toBeInTheDocument();

    click(/Previous/);
    expect(screen.getByRole('heading', { name: 'Role & Assignment' })).toBeInTheDocument();
    click(/Previous/);
    expect((screen.getByPlaceholderText('John') as HTMLInputElement).value).toBe('Musu');
  });

  it('requires a school for a School Admin', async () => {
    mockNemis();
    renderPage();
    fillBasics();
    click(/Next/);
    fireEvent.change(roleSelect(), { target: { value: 'INSTITUTION_ADMIN' } });
    await waitFor(() => expect(screen.getByRole('option', { name: 'Buchanan High' })).toBeInTheDocument());
    click(/Next/);
    expect(screen.getByText('Institution is required')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Role & Assignment' })).toBeInTheDocument();
  });

  it('submits a School Admin with the chosen school and shows the activation link', async () => {
    const county = mockNemis();
    renderPage();
    fillBasics();
    click(/Next/);
    fireEvent.change(roleSelect(), { target: { value: 'INSTITUTION_ADMIN' } });
    await waitFor(() => expect(screen.getByRole('option', { name: 'Buchanan High' })).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue('Select institution'), { target: { value: 's-1' } });
    click(/Next/);
    expect(screen.getByText('Institution Admin')).toBeInTheDocument();
    expect(screen.getByText('Buchanan High')).toBeInTheDocument();
    click('Create User');

    await waitFor(() => expect(screen.getByText('User Created Successfully!')).toBeInTheDocument());
    expect(county.createUser).toHaveBeenCalledWith({
      firstName: 'Musu',
      lastName: 'Kollie',
      email: 'musu.kollie@moe.gov.lr',
      phoneNumber: '+231770555111',
      role: 'INSTITUTION_ADMIN',
      institutionId: 's-1',
    });
    expect(screen.getByText('https://nemis.example/activate?token=xyz')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Create New User' })).not.toBeInTheDocument();
  });

  it('sends a DEO without a school, and Close returns to the list', async () => {
    const county = mockNemis();
    roleParam = 'DEO';
    renderPage();
    fillBasics();
    click(/Next/);
    expect((screen.getByDisplayValue('DEO') as HTMLSelectElement).value).toBe('DEO');
    click(/Next/);
    click('Create User');
    await waitFor(() => expect(screen.getByText('User Created Successfully!')).toBeInTheDocument());
    expect(county.createUser).toHaveBeenCalledWith({
      firstName: 'Musu',
      lastName: 'Kollie',
      email: 'musu.kollie@moe.gov.lr',
      phoneNumber: '+231770555111',
      role: 'DEO',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(push).toHaveBeenCalledWith('/government/county/users');
  });

  it('shows the sync note when the follow-up pull did not run', async () => {
    mockNemis({
      createUser: vi.fn(async () => ({
        data: { userId: 'u-new', activationUrl: 'https://nemis.example/activate?token=xyz' },
        refreshed: false,
      })),
    });
    roleParam = 'DEO';
    renderPage();
    fillBasics();
    click(/Next/);
    click(/Next/);
    click('Create User');
    await waitFor(() => expect(screen.getByText('User Created Successfully!')).toBeInTheDocument());
    expect(screen.getByText('Saved — this will appear once this device syncs.')).toBeInTheDocument();
  });

  it('shows the friendly duplicate-email text', async () => {
    mockNemis({
      createUser: vi.fn(async () => {
        throw new Error('[REMOTE_REJECTED] Email already registered');
      }),
    });
    roleParam = 'DEO';
    renderPage();
    fillBasics();
    click(/Next/);
    click(/Next/);
    click('Create User');
    await waitFor(() =>
      expect(
        screen.getByText(
          'This email is already registered in the system. Use a different email address, or check the Users list to manage the existing account.',
        ),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole('heading', { name: 'Review & Submit' })).toBeInTheDocument();
  });

  it('shows other server messages as-is, and a fallback for unknown errors', async () => {
    const county = mockNemis({
      createUser: vi.fn(async () => {
        throw new Error('[FORBIDDEN] You can only manage users in your county.');
      }),
    });
    roleParam = 'DEO';
    renderPage();
    fillBasics();
    click(/Next/);
    click(/Next/);
    click('Create User');
    await waitFor(() =>
      expect(screen.getByText('You can only manage users in your county.')).toBeInTheDocument(),
    );
    county.createUser.mockImplementation(async () => {
      throw new Error('boom');
    });
    click('Create User');
    await waitFor(() =>
      expect(screen.getByText('Failed to create user. Please try again.')).toBeInTheDocument(),
    );
  });

  it('offline: Create User is disabled with the hint', () => {
    const county = mockNemis();
    roleParam = 'DEO';
    renderPage(false);
    expect(screen.getByText('User changes need an internet connection.')).toBeInTheDocument();
    fillBasics();
    click(/Next/);
    click(/Next/);
    expect(screen.getByRole('button', { name: 'Create User' })).toBeDisabled();
    click('Create User');
    expect(county.createUser).not.toHaveBeenCalled();
  });

  it('Back to Users and Cancel return to the list', () => {
    mockNemis();
    renderPage();
    click(/Back to Users/);
    click('Cancel');
    expect(push).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenCalledWith('/government/county/users');
  });
});
