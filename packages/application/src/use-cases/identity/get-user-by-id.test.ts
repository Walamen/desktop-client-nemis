import { describe, expect, it } from 'vitest';
import { User, UserOrganization } from '@nemis-desktop/domain';
import { SystemRole } from '@nemis-desktop/types';
import { GetUserByIdUseCase } from './get-user-by-id';
import { InMemoryUserRepository } from '../../testing/identity/in-memory-user-repository';
import { RecordingLogger } from '../../testing';

describe('GetUserByIdUseCase', () => {
  it('returns the mapped user with active roles', async () => {
    const users = new InMemoryUserRepository();
    users.store.set(
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
    const useCase = new GetUserByIdUseCase({ users, logger: new RecordingLogger() });
    const res = await useCase.execute({ userId: 'usr-1' });
    expect(res.data?.email).toBe('joseph@example.com');
    expect(res.data?.roles).toEqual([SystemRole.INSTITUTION_ADMIN]);
  });

  it('returns null when the user is missing', async () => {
    const useCase = new GetUserByIdUseCase({
      users: new InMemoryUserRepository(),
      logger: new RecordingLogger(),
    });
    const res = await useCase.execute({ userId: 'missing' });
    expect(res.data).toBeNull();
  });
});
