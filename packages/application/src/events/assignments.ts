import type { ApplicationEvent } from '../interfaces/event-publisher';

export interface AssignmentCreated extends ApplicationEvent {
  readonly name: 'AssignmentCreated';
  readonly assignmentId: string;
  readonly classId: string;
  readonly teacherId: string;
}

export interface SubmissionGraded extends ApplicationEvent {
  readonly name: 'SubmissionGraded';
  readonly assignmentId: string;
  readonly studentId: string;
}
