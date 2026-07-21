import type { DomainEvent } from '../../core';

export interface TermCreatedEvent extends DomainEvent {
  readonly name: 'TermCreated';
  readonly academicYearId: string;
  readonly termName: string;
}
