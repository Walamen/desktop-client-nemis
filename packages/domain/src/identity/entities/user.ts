import { AggregateRoot } from '../../core';
import type { EntityId } from '../../core';
import { EmailAddress, PersonName } from '../../value-objects';
import { EntityValidationException } from '../../exceptions';
import type { SystemRole } from '@nemis-desktop/types';
import { UserOrganization } from './user-organization';
import type { UserCreatedEvent } from '../events/user-created';

export type UserId = EntityId<'User'>;

interface UserState {
  name: PersonName;
  email: EmailAddress;
  isActive: boolean;
  organizations: UserOrganization[];
}

export interface CreateUserInput {
  id: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  organizations: UserOrganization[];
  occurredAt: string;
}

export interface ReconstituteUserInput {
  id: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  isActive: boolean;
  organizations: UserOrganization[];
  version: number;
  updatedAt: string;
  lastModifiedBy?: string;
}

export class User extends AggregateRoot<UserId> {
  #state: UserState;

  private constructor(
    id: UserId,
    state: UserState,
    metadata: { version: number; updatedAt: string; lastModifiedBy?: string },
  ) {
    super(id, metadata);
    this.#state = state;
  }

  static create(input: CreateUserInput): User {
    if (input.organizations.length === 0) {
      throw new EntityValidationException('User must have at least one organization role', [
        { field: 'organizations', message: 'must not be empty' },
      ]);
    }
    const user = new User(
      input.id as UserId,
      {
        name: PersonName.create({
          firstName: input.firstName,
          middleName: input.middleName,
          lastName: input.lastName,
        }),
        email: EmailAddress.create(input.email),
        isActive: true,
        organizations: input.organizations,
      },
      { version: 1, updatedAt: input.occurredAt },
    );
    const event: UserCreatedEvent = {
      name: 'UserCreated',
      aggregateId: user.id,
      occurredAt: input.occurredAt,
      email: user.email.value,
    };
    user.addEvent(event);
    return user;
  }

  static reconstitute(input: ReconstituteUserInput): User {
    return new User(
      input.id as UserId,
      {
        name: PersonName.create({
          firstName: input.firstName,
          middleName: input.middleName,
          lastName: input.lastName,
        }),
        email: EmailAddress.create(input.email),
        isActive: input.isActive,
        organizations: input.organizations,
      },
      { version: input.version, updatedAt: input.updatedAt, lastModifiedBy: input.lastModifiedBy },
    );
  }

  get name(): PersonName {
    return this.#state.name;
  }
  get email(): EmailAddress {
    return this.#state.email;
  }
  get isActive(): boolean {
    return this.#state.isActive;
  }
  get organizations(): readonly UserOrganization[] {
    return this.#state.organizations;
  }

  hasRole(role: SystemRole): boolean {
    return this.#state.organizations.some((o) => o.isActive && o.role === role);
  }

  deactivate(by: string, at: string): void {
    if (!this.#state.isActive) return;
    this.#state = { ...this.#state, isActive: false };
    this.touch(by, at);
  }
}
