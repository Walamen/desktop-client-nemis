import { describe, expect, it } from 'vitest';
import type { ProvisioningStatus } from '@nemis-desktop/types';
import {
  DownloadProgressViewModel,
  LoginViewModel,
  ProvisioningViewModel,
  type ProvisioningClient,
} from './provisioning-view-model';

const authenticated: ProvisioningStatus = {
  authentication: 'authenticated',
  stage: 'registration',
  user: {
    id: 'user-1',
    email: 'admin@school.edu',
    firstName: 'School',
    lastName: 'Admin',
    role: 'INSTITUTION_ADMIN',
    scope: { type: 'INSTITUTION', scopeId: 'school-1', institutionId: 'school-1' },
    institutionId: 'school-1',
  },
  device: {
    id: 'device-1',
    fingerprint: 'fingerprint',
    name: 'School-PC',
    platform: 'win32',
    osVersion: '11',
    appVersion: '1.0.0',
  },
  isProvisioned: false,
  completedAt: null,
};

function client(overrides: Partial<ProvisioningClient> = {}): ProvisioningClient {
  return {
    getStatus: async () => authenticated,
    login: async () => authenticated,
    logout: async () => ({ ...authenticated, authentication: 'anonymous', stage: 'welcome', user: null }),
    start: async () => ({ ...authenticated, stage: 'backend_gap' }),
    ...overrides,
  };
}

describe('provisioning view models', () => {
  it('authenticates without retaining credentials in state', async () => {
    const vm = new LoginViewModel(client());
    await expect(vm.authenticate({ email: 'admin@school.edu', password: 'secret' })).resolves.toEqual(authenticated);
    expect(vm.store.getState()).toEqual({ status: 'authenticated', submitting: false, error: null });
  });

  it('restores and safely advances provisioning status', async () => {
    const vm = new ProvisioningViewModel(client());
    await vm.restore();
    expect(vm.store.getState().status?.stage).toBe('registration');
    await vm.start();
    expect(vm.store.getState().status?.stage).toBe('backend_gap');
  });

  it('bounds reported progress', () => {
    const vm = new DownloadProgressViewModel();
    vm.report({ stage: 'downloading', percent: 140, message: 'Downloading' });
    expect(vm.store.getState().percent).toBe(100);
  });
});
