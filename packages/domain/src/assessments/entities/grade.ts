import { AggregateRoot } from '../../core';
import { Marks } from '../../value-objects';
import { InvalidStateException } from '../../exceptions';
import { GradeStatus } from '@nemis-desktop/types';
import type { GradePublishedEvent } from '../events/assessment-events';

interface GradeState {
  studentId: string;
  subjectId: string;
  marks: Marks;
  status: GradeStatus;
  isPublished: boolean;
}

export interface CreateGradeInput {
  id: string;
  studentId: string;
  subjectId: string;
  obtained: number;
  total: number;
  status: GradeStatus;
  occurredAt: string;
}

const PUBLISHABLE: ReadonlySet<GradeStatus> = new Set([GradeStatus.APPROVED, GradeStatus.SUBMITTED]);

export class Grade extends AggregateRoot<string> {
  #state: GradeState;

  private constructor(
    id: string,
    state: GradeState,
    metadata: { version: number; updatedAt: string; lastModifiedBy?: string },
  ) {
    super(id, metadata);
    this.#state = state;
  }

  static create(input: CreateGradeInput): Grade {
    return new Grade(
      input.id,
      {
        studentId: input.studentId,
        subjectId: input.subjectId,
        marks: Marks.create({ obtained: input.obtained, total: input.total }),
        status: input.status,
        isPublished: input.status === GradeStatus.PUBLISHED,
      },
      { version: 1, updatedAt: input.occurredAt },
    );
  }

  get studentId(): string {
    return this.#state.studentId;
  }
  get subjectId(): string {
    return this.#state.subjectId;
  }
  get marks(): Marks {
    return this.#state.marks;
  }
  get status(): GradeStatus {
    return this.#state.status;
  }
  get isPublished(): boolean {
    return this.#state.isPublished;
  }

  publish(by: string, at: string): void {
    if (!PUBLISHABLE.has(this.#state.status)) {
      throw new InvalidStateException(
        `Grade cannot be published from status ${this.#state.status}`,
      );
    }
    this.#state = { ...this.#state, status: GradeStatus.PUBLISHED, isPublished: true };
    this.touch(by, at);
    const event: GradePublishedEvent = {
      name: 'GradePublished',
      aggregateId: this.id,
      occurredAt: at,
      studentId: this.#state.studentId,
      subjectId: this.#state.subjectId,
    };
    this.addEvent(event);
  }

  lock(by: string, at: string): void {
    if (this.#state.status === GradeStatus.LOCKED) return;
    this.#state = { ...this.#state, status: GradeStatus.LOCKED };
    this.touch(by, at);
  }
}
