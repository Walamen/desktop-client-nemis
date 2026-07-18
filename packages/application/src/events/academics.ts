import type { ApplicationEvent } from '../interfaces/event-publisher';

export interface EnrollmentRegistered extends ApplicationEvent {
  readonly name: 'EnrollmentRegistered';
  readonly enrollmentId: string;
  readonly studentId: string;
  readonly classId: string;
}
