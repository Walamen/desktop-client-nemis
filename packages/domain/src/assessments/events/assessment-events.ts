import type { DomainEvent } from '../../core';

export interface AssessmentCreatedEvent extends DomainEvent {
  readonly name: 'AssessmentCreated';
  readonly classId: string;
  readonly subjectId: string;
}

export interface GradePublishedEvent extends DomainEvent {
  readonly name: 'GradePublished';
  readonly studentId: string;
  readonly subjectId: string;
}
