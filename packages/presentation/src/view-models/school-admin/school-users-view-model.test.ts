import { describe, expect, it } from 'vitest';
import type { SchoolUsersResult } from '@nemis-desktop/types';
import { createTestApplication } from '../../testing/create-test-application';
import { createPresentationLayer } from '../../factories/create-presentation-layer';
import { SchoolUsersViewModel } from './school-users-view-model';

const RESULT: SchoolUsersResult = {
  source: 'server',
  users: [
    {
      id: 'u1', firstName: 'Ada', lastName: 'Kollie', email: 'ada@school.lr', phoneNumber: null, photoUrl: null,
      role: 'INSTITUTION_STAFF', title: 'Registrar', modules: ['STUDENTS'], isActive: true, lastLoginAt: null, staffId: null,
    },
  ],
  linkableStaff: [{ id: 's1', firstName: 'Kofi', lastName: 'Doe', position: 'Teacher' }],
};

describe('SchoolUsersViewModel', () => {
  it('load stores the bridged result', async () => {
    const vm = new SchoolUsersViewModel({ loadSchoolUsers: async () => RESULT });
    expect(vm.store.getState().users.status).toBe('idle');
    await vm.load();
    expect(vm.store.getState().users).toEqual({ status: 'success', data: RESULT });
  });

  it('reaches the error state when the load fails', async () => {
    const vm = new SchoolUsersViewModel({
      loadSchoolUsers: async () => {
        throw new Error('boom');
      },
    });
    await vm.load();
    expect(vm.store.getState().users.status).toBe('error');
  });

  it('reaches the error state when no loader is wired', async () => {
    const vm = new SchoolUsersViewModel({});
    await vm.load();
    expect(vm.store.getState().users.status).toBe('error');
  });

  it('is wired from PresentationLayerOptions.loadSchoolUsers', async () => {
    const { app } = createTestApplication();
    const layer = createPresentationLayer(app, { loadSchoolUsers: async () => RESULT });
    await layer.viewModels.schoolUsers.load();
    expect(layer.viewModels.schoolUsers.store.getState().users).toEqual({ status: 'success', data: RESULT });
  });
});
