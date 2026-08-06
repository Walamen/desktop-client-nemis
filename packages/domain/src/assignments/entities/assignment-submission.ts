import { AggregateRoot } from '../../core';
import { SubmissionStatus, type SubmissionStatus as SubmissionStatusValue } from '@nemis-desktop/types';
import type { SubmissionGradedEvent } from '../events/assignment-events';

interface AssignmentSubmissionState {
  assignmentId: string;
  studentId: string;
  status: SubmissionStatusValue;
  submittedAt?: string;
  response?: string;
  fileUrl?: string;
  fileName?: string;
  grade?: number;
  feedback?: string;
}

export interface AssignmentSubmissionInput {
  id: string;
  assignmentId: string;
  studentId: string;
  status: SubmissionStatusValue;
  submittedAt?: string;
  response?: string;
  fileUrl?: string;
  fileName?: string;
  grade?: number;
  feedback?: string;
  occurredAt: string;
}

/** Desktop never originates a submission — students submit elsewhere and it
 * arrives via sync-pull. This aggregate exists to (a) rehydrate a synced-down
 * row for display and (b) apply a teacher's grade to it. */
export class AssignmentSubmission extends AggregateRoot<string> {
  #state: AssignmentSubmissionState;

  private constructor(
    id: string,
    state: AssignmentSubmissionState,
    metadata: { version: number; updatedAt: string; lastModifiedBy?: string },
  ) {
    super(id, metadata);
    this.#state = state;
  }

  static of(input: AssignmentSubmissionInput): AssignmentSubmission {
    return new AssignmentSubmission(
      input.id,
      {
        assignmentId: input.assignmentId,
        studentId: input.studentId,
        status: input.status,
        submittedAt: input.submittedAt,
        response: input.response,
        fileUrl: input.fileUrl,
        fileName: input.fileName,
        grade: input.grade,
        feedback: input.feedback,
      },
      { version: 1, updatedAt: input.occurredAt },
    );
  }

  get assignmentId(): string {
    return this.#state.assignmentId;
  }
  get studentId(): string {
    return this.#state.studentId;
  }
  get status(): SubmissionStatusValue {
    return this.#state.status;
  }
  get submittedAt(): string | undefined {
    return this.#state.submittedAt;
  }
  get response(): string | undefined {
    return this.#state.response;
  }
  get fileUrl(): string | undefined {
    return this.#state.fileUrl;
  }
  get fileName(): string | undefined {
    return this.#state.fileName;
  }
  get grade(): number | undefined {
    return this.#state.grade;
  }
  get feedback(): string | undefined {
    return this.#state.feedback;
  }

  /** Mirrors the web backend's grade upsert: always moves to GRADED, and if
   * the student never actually submitted (a synthesized PENDING row being
   * graded directly), submittedAt is backfilled to now. */
  recordGrade(grade: number, feedback: string | undefined, by: string, at: string): void {
    this.#state = {
      ...this.#state,
      grade,
      feedback,
      status: SubmissionStatus.GRADED,
      submittedAt: this.#state.submittedAt ?? at,
    };
    this.touch(by, at);
    const event: SubmissionGradedEvent = {
      name: 'SubmissionGraded',
      aggregateId: this.id,
      occurredAt: at,
      studentId: this.#state.studentId,
      assignmentId: this.#state.assignmentId,
    };
    this.addEvent(event);
  }
}
