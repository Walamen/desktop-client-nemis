import { describe, expect, it } from 'vitest';
import { User, UserOrganization } from '@nemis-desktop/domain';
import { SystemRole } from '@nemis-desktop/types';
import { GetCurrentUserUseCase } from './get-current-user';
import { InMemoryUserRepository } from '../../testing/identity/in-memory-user-repository';
import { RecordingLogger } from '../../testing';

function user(id: string, email: string, updatedAt: string) {
  return User.reconstitute({
    id,
    firstName: 'First',
    lastName: 'Last',
    email,
    isActive: true,
    organizations: [
      UserOrganization.reconstitute({
        id: `org-${id}`,
        role: SystemRole.PARENT,
        isActive: true,
      }),
    ],
    version: 1,
    updatedAt,
  });
}

describe('GetCurrentUserUseCase', () => {
  it('returns the authenticated user, not just the earliest row in the workspace', async () => {
    // A workspace's local `users` table holds every person tied to the
    // institution's provisioning snapshot (staff, admins, parents) — not just
    // the one signed-in individual. The earliest-updated row here belongs to
    // someone else entirely; the signed-in user is 'usr-teacher'.
    const users = new InMemoryUserRepository();
    users.store.set('usr-other', user('usr-other', 'other@example.com', '2020-01-01T00:00:00.000Z'));
    users.store.set('usr-teacher', user('usr-teacher', 'teacher@example.com', '2026-01-01T00:00:00.000Z'));

    const useCase = new GetCurrentUserUseCase({
      users,
      logger: new RecordingLogger(),
      currentUserId: 'usr-teacher',
    });
    const res = await useCase.execute({});
    expect(res.data?.email).toBe('teacher@example.com');
  });

  it('carries photo, first/last name and only the active roles', async () => {
    const users = new InMemoryUserRepository();
    users.store.set(
      'usr-musu',
      User.reconstitute({
        id: 'usr-musu',
        firstName: 'Musu',
        lastName: 'Kollie',
        email: 'musu@example.com',
        isActive: true,
        photoUrl: 'https://res.cloudinary.com/x/a.jpg',
        organizations: [
          UserOrganization.reconstitute({ id: 'o1', role: SystemRole.DEO, isActive: false }),
          UserOrganization.reconstitute({ id: 'o2', role: SystemRole.COUNTY_ADMIN, isActive: true }),
        ],
        version: 1,
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    const useCase = new GetCurrentUserUseCase({
      users,
      logger: new RecordingLogger(),
      currentUserId: 'usr-musu',
    });
    const res = await useCase.execute({});
    expect(res.data).toMatchObject({
      photoUrl: 'https://res.cloudinary.com/x/a.jpg',
      firstName: 'Musu',
      lastName: 'Kollie',
      roles: ['COUNTY_ADMIN'],
    });
  });

  it('returns null when the authenticated user has no local row yet', async () => {
    const useCase = new GetCurrentUserUseCase({
      users: new InMemoryUserRepository(),
      logger: new RecordingLogger(),
      currentUserId: 'usr-not-provisioned',
    });
    const res = await useCase.execute({});
    expect(res.data).toBeNull();
  });
});
