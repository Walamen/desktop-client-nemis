import { describe, expect, it } from 'vitest';
import { User, UserOrganization } from '@nemis-desktop/domain';
import { SystemRole } from '@nemis-desktop/types';
import { SessionStore } from '../../stores/session-store';
import { createTestApplication } from '../../testing/create-test-application';
import { CurrentUserViewModel } from './current-user-view-model';

function build() {
  const { app, ports } = createTestApplication();
  ports.users.store.set(
    'usr-1',
    User.reconstitute({
      id: 'usr-1',
      firstName: 'Joseph',
      lastName: 'Boakai',
      email: 'joseph@example.com',
      isActive: true,
      organizations: [
        UserOrganization.reconstitute({
          id: 'org-1',
          role: SystemRole.INSTITUTION_ADMIN,
          institutionId: 'inst-1',
          isActive: true,
        }),
      ],
      version: 1,
      updatedAt: '2026-07-18T00:00:00.000Z',
    }),
  );
  const session = new SessionStore();
  const vm = new CurrentUserViewModel({ identity: app.identity, session });
  return { vm, session };
}

describe('CurrentUserViewModel', () => {
  it('loads the user view and records the session user', async () => {
    const { vm, session } = build();
    await vm.loadUser('usr-1');
    const user = vm.store.getState().user;
    expect(user.status).toBe('success');
    if (user.status === 'success') {
      expect(user.data.fullName).toBe('Joseph Boakai');
      expect(user.data.roleLabels).toEqual(['Principal']);
      expect(user.data.status.label).toBe('Active');
    }
    expect(session.store.getState().currentUserId).toBe('usr-1');
  });

  it('clears the session user when the user is missing', async () => {
    const { vm, session } = build();
    session.setCurrentUser('stale');
    await vm.loadUser('missing');
    expect(vm.store.getState().user.status).toBe('empty');
    expect(session.store.getState().currentUserId).toBeNull();
  });
});
