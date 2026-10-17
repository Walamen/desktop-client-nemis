import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { CreateSchoolPage } from './CreateSchoolPage';

const push = vi.fn();
let registrationParam: string | null = null;
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => ({ get: (key: string) => (key === 'registration' ? registrationParam : null) }),
}));

const ui = vi.hoisted(() => ({
  showCredentials: vi.fn(async () => ({})),
  showError: vi.fn(async () => ({})),
  showSuccess: vi.fn(async () => ({})),
}));
vi.mock('@nemis-desktop/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nemis-desktop/ui')>()),
  ...ui,
}));

const ID = '6f1c2a8e-3b4d-4e5f-9a0b-1c2d3e4f5a6b';
const CONTEXT = {
  county: { id: 'c-1', name: 'Grand Bassa', code: 'GB' },
  districts: [{ id: 'd-1', name: 'Buchanan' }],
};
const registration = (syncState: string, extra: Record<string, unknown> = {}) => ({
  id: ID, countyId: 'c-1', source: 'form', payload: {}, syncState, syncError: null, principalLogin: null,
  createdAt: 'x', updatedAt: 'x', syncedAt: null, ...extra,
});

function renderWith(county: Record<string, unknown> = {}) {
  const api = {
    getRegistrationContext: vi.fn(async () => CONTEXT),
    registerSchools: vi.fn(async () => ({ status: 'saved', ids: [ID] })),
    resubmitSchoolRegistration: vi.fn(async () => ({ status: 'saved', ids: [ID] })),
    discardSchoolRegistration: vi.fn(async () => ({ discarded: true })),
    getSchoolRegistrations: vi.fn(async () => []),
    settleSchoolRegistrations: vi.fn(async () => [registration('pending')]),
    ...county,
  };
  (window as unknown as { nemis: unknown }).nemis = { county: api };
  render(
    <PresentationProvider layer={createRendererPresentation()}>
      <CreateSchoolPage />
    </PresentationProvider>,
  );
  return api;
}

async function fillStepsOneAndTwo(name = 'Ada Doe', email = 'ada@school.lr') {
  await waitFor(() => expect(screen.getByRole('option', { name: 'Buchanan' })).toBeInTheDocument());
  fireEvent.change(screen.getByPlaceholderText('Enter full school name'), { target: { value: 'Alpha School' } });
  fireEvent.change(screen.getByPlaceholderText('e.g. LR-MONT-001'), { target: { value: 'LR-0042' } });
  fireEvent.change(screen.getAllByRole('combobox')[1]!, { target: { value: 'd-1' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /^Primary/ }));
  fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
  fireEvent.change(screen.getByPlaceholderText('Full name'), { target: { value: name } });
  fireEvent.change(screen.getByPlaceholderText('school@example.com'), { target: { value: email } });
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  push.mockReset();
  registrationParam = null;
  for (const fn of Object.values(ui)) fn.mockClear();
});

describe('Create School page', () => {
  it('walks the seven steps and saves the web payload', async () => {
    const api = renderWith();
    await fillStepsOneAndTwo();
    for (let step = 3; step <= 7; step++) {
      fireEvent.click(screen.getByRole('button', { name: step === 3 ? /Continue with Optional Details/ : /^Next/ }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Submit Registration' }));
    await waitFor(() => expect(api.registerSchools).toHaveBeenCalledTimes(1));
    expect(api.registerSchools).toHaveBeenCalledWith({
      source: 'form',
      schools: [
        expect.objectContaining({
          name: 'Alpha School',
          type: 'SCHOOL',
          levels: ['PRIMARY'],
          ownership: 'GOVERNMENT',
          districtId: 'd-1',
          emisCode: 'LR-0042',
          isActive: true,
          principalName: 'Ada Doe',
          admins: [{ email: 'ada@school.lr', firstName: 'Ada', lastName: 'Doe' }],
          metadata: expect.objectContaining({
            enrollmentStats: expect.objectContaining({ grade1: { male: 0, female: 0, total: 0 } }),
          }),
        }),
      ],
    });
  });

  it('blocks step 2 on an invalid email and a one-letter name', async () => {
    const api = renderWith();
    await fillStepsOneAndTwo('A', 'jane@school');
    expect(screen.getByText('Invalid email')).toBeInTheDocument();
    expect(screen.getByText('First and last name must each be at least 2 characters')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit & Finish' })).toBeDisabled();
    expect(api.registerSchools).not.toHaveBeenCalled();
  });

  it('shows the saved-on-device message and returns to the list when the school is still waiting', async () => {
    const api = renderWith();
    await fillStepsOneAndTwo();
    fireEvent.click(screen.getByRole('button', { name: 'Submit & Finish' }));
    await waitFor(() =>
      expect(ui.showSuccess).toHaveBeenCalledWith("Saved on this device. It will be sent when you're back online.", 'Saved'),
    );
    expect(api.settleSchoolRegistrations).toHaveBeenCalledWith([ID], 5_000);
    expect(push).toHaveBeenCalledWith('/government/county/schools');
  });

  it('shows the principal login pop-up when the server accepts within the wait', async () => {
    const login = { email: 'ada@school.lr', password: 'Nemis@123' };
    renderWith({ settleSchoolRegistrations: vi.fn(async () => [registration('synced', { principalLogin: login })]) });
    await fillStepsOneAndTwo();
    fireEvent.click(screen.getByRole('button', { name: 'Submit & Finish' }));
    await waitFor(() => expect(ui.showCredentials).toHaveBeenCalledWith(login));
    expect(push).toHaveBeenCalledWith('/government/county/schools');
  });

  it('shows the server reason and keeps the form when refused within the wait', async () => {
    const api = renderWith({
      settleSchoolRegistrations: vi.fn(async () => [registration('rejected', { syncError: 'Email taken' })]),
    });
    await fillStepsOneAndTwo();
    fireEvent.click(screen.getByRole('button', { name: 'Submit & Finish' }));
    await waitFor(() => expect(ui.showError).toHaveBeenCalledWith('Email taken', 'Registration Failed'));
    expect(api.discardSchoolRegistration).toHaveBeenCalledWith(ID);
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('school@example.com')).toHaveValue('ada@school.lr');
  });

  it('ignores a second Save click while saving', async () => {
    let release: (value: unknown) => void = () => {};
    const api = renderWith({
      registerSchools: vi.fn(() => new Promise((resolve) => (release = resolve))),
    });
    await fillStepsOneAndTwo();
    const submit = screen.getByRole('button', { name: 'Submit & Finish' });
    fireEvent.click(submit);
    fireEvent.click(submit);
    release({ status: 'saved', ids: [ID] });
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(api.registerSchools).toHaveBeenCalledTimes(1);
  });

  it('Fix and resend prefills, clears a district that no longer exists, and resubmits', async () => {
    registrationParam = ID;
    const api = renderWith({
      getSchoolRegistrations: vi.fn(async () => [
        registration('rejected', {
          syncError: 'District not found',
          payload: {
            name: 'Old Name', code: 'GB-0042', type: 'SCHOOL', levels: ['PRIMARY'], ownership: 'PRIVATE',
            countyId: 'c-1', districtId: 'gone', isActive: true, principalName: 'Ada Doe', emisCode: 'LR-0042',
            admins: [{ email: 'ada@school.lr', firstName: 'Ada', lastName: 'Doe' }],
          },
        }),
      ]),
    });
    await waitFor(() => expect(screen.getByPlaceholderText('Enter full school name')).toHaveValue('Old Name'));
    expect(screen.getAllByRole('combobox')[1]).toHaveValue('');
    expect(screen.getAllByRole('combobox')[0]).toHaveValue('PRIVATE');
    fireEvent.change(screen.getAllByRole('combobox')[1]!, { target: { value: 'd-1' } });
    fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
    expect(screen.getByPlaceholderText('school@example.com')).toHaveValue('ada@school.lr');
    fireEvent.click(screen.getByRole('button', { name: 'Submit & Finish' }));
    await waitFor(() => expect(api.resubmitSchoolRegistration).toHaveBeenCalledTimes(1));
    expect(api.resubmitSchoolRegistration).toHaveBeenCalledWith({
      id: ID,
      school: expect.objectContaining({ name: 'Old Name', districtId: 'd-1', ownership: 'PRIVATE' }),
    });
    expect(api.registerSchools).not.toHaveBeenCalled();
  });

  it('shows a code clash under EMIS Code on step 1', async () => {
    renderWith({
      registerSchools: vi.fn(async () => ({
        status: 'code-clash',
        clashes: [{ index: 0, code: 'GB-0042', existingName: 'Old School' }],
      })),
    });
    await fillStepsOneAndTwo();
    fireEvent.click(screen.getByRole('button', { name: 'Submit & Finish' }));
    await waitFor(() => expect(screen.getByText('This school code already exists: Old School')).toBeInTheDocument());
    expect(screen.getByPlaceholderText('e.g. LR-MONT-001')).toBeInTheDocument();
  });

  it('an online Fix and resend refused again keeps the school, so the next Save resubmits it', async () => {
    registrationParam = ID;
    const api = renderWith({
      getSchoolRegistrations: vi.fn(async () => [
        registration('rejected', {
          syncError: 'Email taken',
          payload: {
            name: 'Old Name', code: 'GB-0042', type: 'SCHOOL', levels: ['PRIMARY'], ownership: 'GOVERNMENT',
            countyId: 'c-1', districtId: 'd-1', isActive: true, principalName: 'Ada Doe',
            admins: [{ email: 'ada@school.lr', firstName: 'Ada', lastName: 'Doe' }],
          },
        }),
      ]),
      settleSchoolRegistrations: vi.fn(async () => [registration('rejected', { syncError: 'Email taken' })]),
    });
    await waitFor(() => expect(screen.getByPlaceholderText('Enter full school name')).toHaveValue('Old Name'));
    fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit & Finish' }));
    await waitFor(() => expect(ui.showError).toHaveBeenCalledWith('Email taken', 'Registration Failed'));
    expect(api.discardSchoolRegistration).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText('school@example.com'), { target: { value: 'new@school.lr' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit & Finish' }));
    await waitFor(() => expect(api.resubmitSchoolRegistration).toHaveBeenCalledTimes(2));
    expect(api.resubmitSchoolRegistration).toHaveBeenLastCalledWith({
      id: ID,
      school: expect.objectContaining({ admins: [{ email: 'new@school.lr', firstName: 'Ada', lastName: 'Doe' }] }),
    });
    expect(push).not.toHaveBeenCalled();
  });

  it('a second Save click during the online wait does not save the school twice', async () => {
    let settle: (value: unknown) => void = () => {};
    const api = renderWith({ settleSchoolRegistrations: vi.fn(() => new Promise((resolve) => (settle = resolve))) });
    await fillStepsOneAndTwo();
    fireEvent.click(screen.getByRole('button', { name: 'Submit & Finish' }));
    await waitFor(() => expect(api.settleSchoolRegistrations).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: /Submitting/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Submitting/ }));
    settle([registration('pending')]);
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(api.registerSchools).toHaveBeenCalledTimes(1);
  });

  it('sends the principal email trimmed, as it was checked', async () => {
    const api = renderWith();
    await fillStepsOneAndTwo('Ada Doe', 'ada@school.lr ');
    fireEvent.click(screen.getByRole('button', { name: 'Submit & Finish' }));
    await waitFor(() => expect(api.registerSchools).toHaveBeenCalledTimes(1));
    expect(api.registerSchools).toHaveBeenCalledWith({
      source: 'form',
      schools: [expect.objectContaining({ admins: [{ email: 'ada@school.lr', firstName: 'Ada', lastName: 'Doe' }] })],
    });
  });
});
