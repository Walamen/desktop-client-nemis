import type { ApplicationEvent } from '../interfaces/event-publisher';

export interface AssessmentCreated extends ApplicationEvent {
  readonly name: 'AssessmentCreated';
  readonly assessmentId: string;
}

export interface GradePublished extends ApplicationEvent {
  readonly name: 'GradePublished';
  readonly gradeId: string;
  readonly studentId: string;
  readonly subjectId: string;
}
