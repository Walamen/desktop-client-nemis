import { describe, expect, it } from 'vitest';
import type { DeoApplicationService } from '@nemis-desktop/application';
import { createTestApplication } from '../../testing/create-test-application';
import { DeoSchoolAdminsViewModel } from './deo-school-admins-view-model';
import { ADMIN_TABS, adminTabCounts, filterAdminsByTab, lastActiveLabel } from './deo-school-admins-views';

describe('school admin directory helpers', () => {
  const admins = [
    { userId: 'a', isActive: true },
    { userId: 'b', isActive: false },
    { userId: 'c', isActive: true },
  ];

  it('counts and filters All, Active and Suspended', () => {
    expect(ADMIN_TABS).toEqual(['All', 'Active', 'Suspended']);
    expect(adminTabCounts(admins)).toEqual({ All: 3, Active: 2, Suspended: 1 });
    expect(filterAdminsByTab(admins, 'Active').map((a) => a.userId)).toEqual(['a', 'c']);
    expect(filterAdminsByTab(admins, 'Suspended').map((a) => a.userId)).toEqual(['b']);
  });

  it('describes the last sign-in as the web does', () => {
    const now = new Date(2026, 10, 16, 12, 0, 0);
    expect(lastActiveLabel(null, now)).toBe('Never signed in');
    expect(lastActiveLabel(new Date(2026, 10, 16, 7, 0, 0).toISOString(), now)).toBe('today');
    expect(lastActiveLabel(new Date(2026, 10, 15, 23, 0, 0).toISOString(), now)).toBe('yesterday');
    expect(lastActiveLabel(new Date(2026, 10, 13, 9, 0, 0).toISOString(), now)).toBe('3 days ago');
    expect(lastActiveLabel(new Date(2026, 9, 17, 9, 0, 0).toISOString(), now)).toBe('30 days ago');
    expect(lastActiveLabel(new Date(2026, 2, 4, 9, 0, 0).toISOString(), now)).toBe('Mar 4, 2026');
  });
});

describe('DeoSchoolAdminsViewModel', () => {
  it('loads the directory of the signed-in officer', async () => {
    const { app, ports } = createTestApplication();
    ports.districtOverview.schools = [{ id: 's-1', name: 'Alpha', code: 'A', levels: [] }];
    const vm = new DeoSchoolAdminsViewModel({ deo: app.deo });
    const loading = vm.load();
    expect(vm.store.getState().directory.status).toBe('loading');
    await loading;
    const state = vm.store.getState().directory;
    expect(state.status).toBe('success');
    if (state.status !== 'success') return;
    expect(state.data.schoolsWithoutAdmin).toEqual([{ id: 's-1', name: 'Alpha' }]);
  });

  it('moves to error when the service fails', async () => {
    const failing = {
      listSchoolAdmins: async () => {
        throw new Error('database locked');
      },
    } as unknown as DeoApplicationService;
    const vm = new DeoSchoolAdminsViewModel({ deo: failing });
    await vm.load();
    expect(vm.store.getState().directory.status).toBe('error');
  });
});
