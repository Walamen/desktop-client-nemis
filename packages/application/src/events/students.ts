import type { ApplicationEvent } from '../interfaces/event-publisher';

export interface StudentRegistered extends ApplicationEvent {
  readonly name: 'StudentRegistered';
  readonly studentId: string;
  readonly institutionId: string;
  readonly admissionNumber: string;
}

export interface StudentGuardianLinked extends ApplicationEvent {
  readonly name: 'StudentGuardianLinked';
  readonly studentId: string;
  readonly guardianId: string;
  readonly isPrimary: boolean;
}
