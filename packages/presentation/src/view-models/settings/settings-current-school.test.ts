import { describe, expect, it } from 'vitest';
import { Institution } from '@nemis-desktop/domain';
import { ApprovalStatus, InstitutionType, OwnershipType } from '@nemis-desktop/types';
import { NotificationStore } from '../../stores/notification-store';
import { createTestApplication } from '../../testing/create-test-application';
import { SettingsViewModel } from './settings-view-model';

describe('SettingsViewModel.loadCurrentSchool', () => {
  it('is empty when no institution exists', async () => {
    const { app } = createTestApplication();
    const vm = new SettingsViewModel({ institution: app.institution, infra: app.infra, notifications: new NotificationStore() });
    await vm.loadCurrentSchool();
    expect(vm.store.getState().profile.status).toBe('empty');
  });

  it('loads the current school with no id argument', async () => {
    const { app, ports } = createTestApplication();
    ports.institutions.store.set(
      'inst-1',
      Institution.reconstitute({
        id: 'inst-1', code: 'lib-001', name: 'Monrovia Central', type: InstitutionType.SCHOOL,
        ownership: OwnershipType.GOVERNMENT, countyId: 'county-1', approvalStatus: ApprovalStatus.APPROVED,
        address: { communityTown: 'Sinkor' }, version: 1, updatedAt: '2026-07-20T00:00:00.000Z',
      }),
    );
    const vm = new SettingsViewModel({ institution: app.institution, infra: app.infra, notifications: new NotificationStore() });
    await vm.loadCurrentSchool();
    const profile = vm.store.getState().profile;
    expect(profile.status).toBe('success');
    if (profile.status === 'success') expect(profile.data.name).toBe('Monrovia Central');
  });
});
