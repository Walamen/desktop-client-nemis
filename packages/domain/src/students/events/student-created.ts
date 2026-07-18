import type { DomainEvent } from '../../core';

export interface StudentCreatedEvent extends DomainEvent {
  readonly name: 'StudentCreated';
  readonly admissionNumber: string;
  readonly institutionId: string;
}
