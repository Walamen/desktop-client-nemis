import type { DomainEvent } from '../../core';

export interface EnrollmentCreatedEvent extends DomainEvent {
  readonly name: 'EnrollmentCreated';
  readonly studentId: string;
  readonly classId: string;
}
