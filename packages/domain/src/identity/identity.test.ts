import { describe, expect, it } from 'vitest';
import { SystemRole } from '@nemis-desktop/types';
import { User } from './entities/user';
import { UserOrganization } from './entities/user-organization';
import { CanSyncEntity } from './specifications/can-sync-entity';
import { EntityValidationException } from '../exceptions';

const ISO = '2026-07-17T00:00:00.000Z';

function newUser(): User {
  return User.create({
    id: 'user-1',
    firstName: 'Ama',
    lastName: 'Kollie',
    email: 'ama@moe.gov.lr',
    organizations: [
      UserOrganization.reconstitute({
        id: 'org-1',
        role: SystemRole.TEACHER,
        institutionId: 'inst-1',
        isActive: true,
      }),
    ],
    occurredAt: ISO,
  });
}

describe('User', () => {
  it('creates with a normalized email and emits UserCreated', () => {
    const user = newUser();
    expect(user.email.value).toBe('ama@moe.gov.lr');
    expect(user.name.full).toBe('Ama Kollie');
    expect(user.hasRole(SystemRole.TEACHER)).toBe(true);
    expect(user.hasRole(SystemRole.DEO)).toBe(false);

    const events = user.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.name).toBe('UserCreated');
  });

  it('deactivate flips isActive and bumps version', () => {
    const user = newUser();
    expect(user.version).toBe(1);
    user.deactivate('admin', ISO);
    expect(user.isActive).toBe(false);
    expect(user.version).toBe(2);
  });

  it('rejects reconstitute without organizations having roles', () => {
    expect(() =>
      User.create({ id: 'u', firstName: '', lastName: 'x', email: 'a@b.co', organizations: [], occurredAt: ISO }),
    ).toThrow(EntityValidationException);
  });

  it('reconstitute does not emit domain events', () => {
    const user = User.reconstitute({
      id: 'user-1',
      firstName: 'Ama',
      lastName: 'Kollie',
      email: 'ama@moe.gov.lr',
      isActive: true,
      organizations: [
        UserOrganization.reconstitute({
          id: 'org-1',
          role: SystemRole.TEACHER,
          institutionId: 'inst-1',
          isActive: true,
        }),
      ],
      version: 3,
      updatedAt: ISO,
    });

    expect(user.pullDomainEvents()).toHaveLength(0);
  });

  it('deactivate is idempotent on an already-inactive user', () => {
    const user = newUser();

    user.deactivate('admin', ISO);
    expect(user.version).toBe(2);
    expect(user.isActive).toBe(false);

    user.deactivate('admin', ISO);
    expect(user.version).toBe(2);
    expect(user.isActive).toBe(false);
  });
});

describe('CanSyncEntity', () => {
  it('requires version >= 1 and a valid updatedAt', () => {
    const spec = new CanSyncEntity();
    expect(spec.isSatisfiedBy({ version: 1, updatedAt: ISO })).toBe(true);
    expect(spec.isSatisfiedBy({ version: 0, updatedAt: ISO })).toBe(false);
    expect(spec.isSatisfiedBy({ version: 1, updatedAt: 'bad' })).toBe(false);
  });
});
