import type { DomainEvent } from '../../core';

export interface AcademicYearCreatedEvent extends DomainEvent {
  readonly name: 'AcademicYearCreated';
  readonly institutionId: string;
  readonly code: string;
}
