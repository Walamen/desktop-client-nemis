import type { DomainEvent } from '../../core';

export interface SubjectCreatedEvent extends DomainEvent {
  readonly name: 'SubjectCreated';
  readonly institutionId: string;
  readonly subjectCode: string;
}
