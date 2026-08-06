import type { DomainEvent } from '../../core';

export interface AssignmentCreatedEvent extends DomainEvent {
  readonly name: 'AssignmentCreated';
  readonly classId: string;
  readonly teacherId: string;
}

export interface AssignmentUpdatedEvent extends DomainEvent {
  readonly name: 'AssignmentUpdated';
}

export interface SubmissionGradedEvent extends DomainEvent {
  readonly name: 'SubmissionGraded';
  readonly studentId: string;
  readonly assignmentId: string;
}
