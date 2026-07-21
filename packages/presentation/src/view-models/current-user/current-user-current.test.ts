import { describe, expect, it } from 'vitest';
import { User, UserOrganization } from '@nemis-desktop/domain';
import { SystemRole } from '@nemis-desktop/types';
import { SessionStore } from '../../stores/session-store';
import { createTestApplication } from '../../testing/create-test-application';
import { CurrentUserViewModel } from './current-user-view-model';

describe('CurrentUserViewModel.loadCurrentUser', () => {
  it('loads the single local user with no id argument', async () => {
    const { app, ports } = createTestApplication();
    ports.users.store.set(
      'usr-1',
      User.reconstitute({
        id: 'usr-1', firstName: 'Local', lastName: 'Admin', email: 'admin@local.nemis',
        isActive: true,
        organizations: [UserOrganization.reconstitute({ id: 'o-1', role: SystemRole.INSTITUTION_ADMIN, isActive: true })],
        version: 1, updatedAt: '2026-07-20T00:00:00.000Z',
      }),
    );
    const session = new SessionStore();
    const vm = new CurrentUserViewModel({ identity: app.identity, session });
    await vm.loadCurrentUser();
    const user = vm.store.getState().user;
    expect(user.status).toBe('success');
    if (user.status === 'success') expect(user.data.fullName).toBe('Local Admin');
    expect(session.store.getState().currentUserId).toBe('usr-1');
  });
});
