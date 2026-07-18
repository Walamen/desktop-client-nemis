import { AggregateRoot } from '../../core';
import { InvalidStateException } from '../../exceptions';
import { EnrollmentStatus } from '@nemis-desktop/types';
import type { EnrollmentCreatedEvent } from '../events/enrollment-created';

interface EnrollmentState {
  studentId: string;
  classId: string;
  academicYearId: string;
  termId: string;
  status: EnrollmentStatus;
}

export interface CreateEnrollmentInput {
  id: string;
  studentId: string;
  classId: string;
  academicYearId: string;
  termId: string;
  occurredAt: string;
}

export class Enrollment extends AggregateRoot<string> {
  #state: EnrollmentState;

  private constructor(
    id: string,
    state: EnrollmentState,
    metadata: { version: number; updatedAt: string; lastModifiedBy?: string },
  ) {
    super(id, metadata);
    this.#state = state;
  }

  static create(input: CreateEnrollmentInput): Enrollment {
    const enrollment = new Enrollment(
      input.id,
      {
        studentId: input.studentId,
        classId: input.classId,
        academicYearId: input.academicYearId,
        termId: input.termId,
        status: EnrollmentStatus.ACTIVE,
      },
      { version: 1, updatedAt: input.occurredAt },
    );
    const event: EnrollmentCreatedEvent = {
      name: 'EnrollmentCreated',
      aggregateId: enrollment.id,
      occurredAt: input.occurredAt,
      studentId: input.studentId,
      classId: input.classId,
    };
    enrollment.addEvent(event);
    return enrollment;
  }

  get studentId(): string {
    return this.#state.studentId;
  }
  get classId(): string {
    return this.#state.classId;
  }
  get status(): EnrollmentStatus {
    return this.#state.status;
  }

  withdraw(by: string, at: string): void {
    if (this.#state.status === EnrollmentStatus.WITHDRAWN) {
      throw new InvalidStateException('Enrollment is already withdrawn');
    }
    this.#state = { ...this.#state, status: EnrollmentStatus.WITHDRAWN };
    this.touch(by, at);
  }
}
