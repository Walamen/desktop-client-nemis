import type { DomainEvent } from '../../core';

export interface UserCreatedEvent extends DomainEvent {
  readonly name: 'UserCreated';
  readonly email: string;
}
