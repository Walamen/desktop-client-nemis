import type { DomainEvent } from '../../core';

export interface ClassCreatedEvent extends DomainEvent {
  readonly name: 'ClassCreated';
  readonly institutionId: string;
  readonly academicYearId: string;
  readonly className: string;
}
