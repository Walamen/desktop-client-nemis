import type { DomainEvent } from '../../core';

export interface StudentCreatedEvent extends DomainEvent {
  readonly name: 'StudentCreated';
  readonly nemisId: string;
  readonly institutionId: string;
}
