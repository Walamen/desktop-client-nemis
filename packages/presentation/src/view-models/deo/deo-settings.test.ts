import { describe, expect, it } from 'vitest';
import type { DeoApplicationService } from '@nemis-desktop/application';
import { createTestApplication } from '../../testing/create-test-application';
import { DeoSettingsViewModel } from './deo-settings-view-model';
import { settingsFormError } from './deo-settings-views';

describe('DEO settings form rules (same as portal-web lib/deo-settings.ts)', () => {
  const form = { firstName: 'Dee', lastName: 'Officer', currentPassword: '', newPassword: '' };
  it.each([
    [form, null],
    [{ ...form, firstName: ' ' }, 'First and last name cannot be empty.'],
    [{ ...form, newPassword: 'newpassword' }, 'Enter your current password to change it.'],
    [{ ...form, currentPassword: 'oldpassword', newPassword: 'short' }, 'The new password must be at least 8 characters.'],
    [{ ...form, currentPassword: 'oldpassword', newPassword: '          ' }, 'The new password cannot be only spaces.'],
    [{ ...form, currentPassword: 'old', newPassword: 'newpassword' }, 'The current password must be at least 8 characters.'],
    [{ ...form, currentPassword: 'oldpassword', newPassword: 'x'.repeat(129) }, 'Passwords can be at most 128 characters.'],
    [{ ...form, currentPassword: 'oldpassword', newPassword: 'newpassword' }, null],
  ])('%p gives %p', (input, error) => {
    expect(settingsFormError(input)).toBe(error);
  });
});

describe('DeoSettingsViewModel', () => {
  it('loads the profile of the signed-in officer', async () => {
    const { app } = createTestApplication();
    const vm = new DeoSettingsViewModel({ deo: app.deo });
    const loading = vm.load();
    expect(vm.store.getState().settings.status).toBe('loading');
    await loading;
    expect(vm.store.getState().settings.status).toBe('success');
  });

  it('moves to error when the service fails', async () => {
    const failing = {
      getSettings: async () => {
        throw new Error('database locked');
      },
    } as unknown as DeoApplicationService;
    const vm = new DeoSettingsViewModel({ deo: failing });
    await vm.load();
    expect(vm.store.getState().settings.status).toBe('error');
  });
});
