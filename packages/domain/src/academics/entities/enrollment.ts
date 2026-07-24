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
  enrollmentDate: string;
}

export interface CreateEnrollmentInput {
  id: string;
  studentId: string;
  classId: string;
  academicYearId: string;
  termId: string;
  occurredAt: string;
  enrollmentDate?: string;
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
        enrollmentDate: input.enrollmentDate ?? input.occurredAt,
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
  get academicYearId(): string { return this.#state.academicYearId; }
  get termId(): string { return this.#state.termId; }
  get enrollmentDate(): string { return this.#state.enrollmentDate; }

  static reconstitute(input: CreateEnrollmentInput & { status: EnrollmentStatus; version: number; updatedAt: string; lastModifiedBy?: string }): Enrollment {
    return new Enrollment(input.id, { studentId: input.studentId, classId: input.classId, academicYearId: input.academicYearId, termId: input.termId, status: input.status, enrollmentDate: input.enrollmentDate ?? input.occurredAt }, { version: input.version, updatedAt: input.updatedAt, lastModifiedBy: input.lastModifiedBy });
  }

  moveToClass(classId: string, by: string, at: string): void {
    if (this.#state.status !== EnrollmentStatus.ACTIVE) throw new InvalidStateException('Only active enrollments can move classes');
    this.#state = { ...this.#state, classId };
    this.touch(by, at);
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
