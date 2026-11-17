import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DeoSettingsResult } from '@nemis-desktop/types';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { DeoSettingsPage } from './DeoSettingsPage';

const SETTINGS: DeoSettingsResult = {
  districtId: 'd-1',
  district: { id: 'd-1', name: 'Owensgrove' },
  county: { id: 'c-1', name: 'Grand Bassa' },
  profile: { firstName: 'Dee', lastName: 'Officer', email: 'dee@nemis.lr', phoneNumber: '0770000000' },
};

function renderPage(opts: { online?: boolean; settings?: DeoSettingsResult; overrides?: Record<string, unknown> } = {}) {
  const deo = {
    getSettings: vi.fn(async () => opts.settings ?? SETTINGS),
    getRemoteSettings: vi.fn(async () => ({ data: { officeAddress: 'Main Street' }, refreshed: false })),
    saveSettings: vi.fn(async () => ({ data: null, refreshed: true })),
    ...opts.overrides,
  };
  (window as unknown as { nemis: unknown }).nemis = { deo };
  const layer = createRendererPresentation();
  layer.stores.connectivity.setOnline(opts.online ?? true);
  render(
    <PresentationProvider layer={layer}>
      <DeoSettingsPage />
    </PresentationProvider>,
  );
  return { deo, layer };
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

const save = () => fireEvent.click(screen.getByRole('button', { name: /Save Changes/ }));

describe('DEO Settings page', () => {
  it('shows the profile and, online, the office address; no switches or employee ID', async () => {
    renderPage();
    expect(await screen.findByDisplayValue('Dee')).toBeTruthy();
    expect(screen.getByText('DEO Portal · Owensgrove · Grand Bassa')).toBeTruthy();
    expect(screen.getByDisplayValue('dee@nemis.lr')).toBeTruthy();
    expect(await screen.findByDisplayValue('Main Street')).toBeTruthy();
    expect(screen.queryByText('Notification Preferences')).toBeNull();
    expect(screen.queryByText('Employee ID')).toBeNull();
  });

  it('saves the profile online and says so', async () => {
    const { deo } = renderPage();
    await screen.findByDisplayValue('Main Street');
    fireEvent.change(screen.getByDisplayValue('0770000000'), { target: { value: '0880000000' } });
    save();
    await waitFor(() =>
      expect(deo.saveSettings).toHaveBeenCalledWith({
        firstName: 'Dee',
        lastName: 'Officer',
        phoneNumber: '0880000000',
        officeAddress: 'Main Street',
      }),
    );
    expect(await screen.findByText('Settings saved successfully.')).toBeTruthy();
  });

  it('checks the password pair before sending, and shows a refusal from the server', async () => {
    const { deo } = renderPage({
      overrides: {
        saveSettings: vi.fn(async () => {
          // What the settings handler's RemoteRejectedError becomes over IPC.
          throw new Error('[REMOTE_REJECTED] Current password is incorrect.');
        }),
      },
    });
    await screen.findByDisplayValue('Main Street');
    fireEvent.change(screen.getByPlaceholderText(/Leave blank/), { target: { value: 'newpassword' } });
    save();
    expect(screen.getByText('Enter your current password to change it.')).toBeTruthy();
    expect(deo.saveSettings).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText(/Required only/), { target: { value: 'wrongpassword' } });
    save();
    expect(await screen.findByText(/Current password is incorrect/)).toBeTruthy();
  });

  it('offline: shows the profile, says saving needs a connection, and never asks the server', async () => {
    const { deo } = renderPage({ online: false });
    expect(await screen.findByDisplayValue('Dee')).toBeTruthy();
    expect(screen.getByText('Settings need a connection to save.')).toBeTruthy();
    expect(screen.getByText('Loads when you are online.')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Save Changes/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(deo.getRemoteSettings).not.toHaveBeenCalled();
  });

  it('a reload during editing never overwrites what the user typed', async () => {
    const { deo, layer } = renderPage();
    await screen.findByDisplayValue('Main Street');
    fireEvent.change(screen.getByDisplayValue('Dee'), { target: { value: 'Deborah' } });
    // A background sync reloads the profile while the user is still editing.
    deo.getSettings.mockResolvedValue({ ...SETTINGS, profile: { ...SETTINGS.profile!, firstName: 'Server Dee' } });
    await act(() => layer.viewModels.deoSettings.load());
    expect(screen.getByDisplayValue('Deborah')).toBeTruthy();
    expect(screen.queryByDisplayValue('Server Dee')).toBeNull();
  });

  it('saved but not yet synced back: keeps what was typed and says it will show after the next sync', async () => {
    const { deo } = renderPage({ overrides: { saveSettings: vi.fn(async () => ({ data: null, refreshed: false })) } });
    await screen.findByDisplayValue('Main Street');
    fireEvent.change(screen.getByDisplayValue('Dee'), { target: { value: 'Deborah' } });
    save();
    expect(await screen.findByText('Settings saved. They will show here after the next sync.')).toBeTruthy();
    expect(screen.getByDisplayValue('Deborah')).toBeTruthy();
    expect(deo.getSettings).toHaveBeenCalledTimes(1);
  });

  it('reconnecting never replaces an office address the user is editing', async () => {
    const { layer } = renderPage();
    const address = await screen.findByDisplayValue('Main Street');
    fireEvent.change(address, { target: { value: 'New Road' } });
    act(() => layer.stores.connectivity.setOnline(false));
    act(() => layer.stores.connectivity.setOnline(true));
    await waitFor(() => expect(screen.getByDisplayValue('New Road')).toBeTruthy());
    expect(screen.queryByDisplayValue('Main Street')).toBeNull();
  });

  it('a failed office address load says so and can be retried', async () => {
    let fail = true;
    const { deo } = renderPage({
      overrides: {
        getRemoteSettings: vi.fn(async () => {
          if (fail) throw new Error('[OFFLINE] down');
          return { data: { officeAddress: 'Main Street' }, refreshed: false };
        }),
      },
    });
    expect(await screen.findByText(/The office address could not be loaded/)).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByDisplayValue('Main Street')).toBeTruthy();
    expect(deo.getRemoteSettings).toHaveBeenCalledTimes(2);
  });

  it('says so when no district is assigned', async () => {
    renderPage({ settings: { districtId: null, district: null, county: null, profile: null } });
    expect(await screen.findByText('No district assigned to your account.')).toBeTruthy();
  });
});
