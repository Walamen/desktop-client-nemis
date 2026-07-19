import { describe, expect, it } from 'vitest';
import { Institution } from '@nemis-desktop/domain';
import { ApprovalStatus, InstitutionType, OwnershipType } from '@nemis-desktop/types';
import { NotificationStore } from '../../stores/notification-store';
import { createTestApplication } from '../../testing/create-test-application';
import { SettingsViewModel } from './settings-view-model';

function build() {
  const { app, ports } = createTestApplication();
  ports.institutions.store.set(
    'inst-1',
    Institution.reconstitute({
      id: 'inst-1',
      code: 'lib-001',
      name: 'Monrovia Central',
      type: InstitutionType.SCHOOL,
      ownership: OwnershipType.GOVERNMENT,
      countyId: 'county-1',
      approvalStatus: ApprovalStatus.APPROVED,
      address: { communityTown: 'Sinkor' },
      version: 1,
      updatedAt: '2026-07-18T00:00:00.000Z',
    }),
  );
  const notifications = new NotificationStore();
  const vm = new SettingsViewModel({
    institution: app.institution,
    infra: app.infra,
    notifications,
  });
  return { vm, notifications };
}

describe('SettingsViewModel', () => {
  it('loads the formatted institution profile', async () => {
    const { vm } = build();
    await vm.loadProfile('inst-1');
    const profile = vm.store.getState().profile;
    expect(profile.status).toBe('success');
    if (profile.status === 'success') {
      expect(profile.data.name).toBe('Monrovia Central');
      expect(profile.data.typeLabel).toBe('School');
      expect(profile.data.approval).toEqual({ label: 'Approved', badge: 'success' });
      expect(profile.data.address).toBe('Sinkor');
    }
  });

  it('reports empty for a missing institution', async () => {
    const { vm } = build();
    await vm.loadProfile('missing');
    expect(vm.store.getState().profile.status).toBe('empty');
  });

  it('saves a grading config and stores the result', async () => {
    const { vm } = build();
    const outcome = await vm.saveGradingConfig({
      id: 'inst-1',
      maxMarks: 100,
      passingMarks: 50,
      requireAdminApproval: true,
    });
    expect(outcome.ok).toBe(true);
    const config = vm.store.getState().gradingConfig;
    expect(config.status).toBe('success');
    if (config.status === 'success') expect(config.data.passingMarks).toBe(50);
  });

  it('rejects an invalid grading config with an error notification', async () => {
    const { vm, notifications } = build();
    const outcome = await vm.saveGradingConfig({
      id: 'inst-1',
      maxMarks: 50,
      passingMarks: 90,
      requireAdminApproval: false,
    });
    expect(outcome.ok).toBe(false);
    expect(notifications.store.getState().notifications[0]?.kind).toBe('error');
    expect(vm.store.getState().submission).toBe('failed');
  });

  it('saves a setting with a success notification', async () => {
    const { vm, notifications } = build();
    const outcome = await vm.saveSetting({ key: 'theme', value: 'dark' });
    expect(outcome.ok).toBe(true);
    expect(notifications.store.getState().notifications[0]?.kind).toBe('success');
  });
});
