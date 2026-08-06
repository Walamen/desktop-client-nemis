import { AggregateRoot } from '../../core';
import type { AssignmentStatus, AssignmentType } from '@nemis-desktop/types';
import type { AssignmentCreatedEvent, AssignmentUpdatedEvent } from '../events/assignment-events';

interface AssignmentState {
  classId: string;
  subjectId?: string;
  teacherId: string;
  title: string;
  type: AssignmentType;
  status: AssignmentStatus;
  instructions?: string;
  dueDate: string;
  totalMarks?: number;
  attachmentUrl?: string;
  attachmentName?: string;
}

export interface CreateAssignmentInput {
  id: string;
  classId: string;
  subjectId?: string;
  teacherId: string;
  title: string;
  type: AssignmentType;
  status: AssignmentStatus;
  instructions?: string;
  dueDate: string;
  totalMarks?: number;
  attachmentUrl?: string;
  attachmentName?: string;
  occurredAt: string;
}

export interface UpdateAssignmentFields {
  title?: string;
  subjectId?: string;
  type?: AssignmentType;
  status?: AssignmentStatus;
  instructions?: string;
  dueDate?: string;
  totalMarks?: number;
  attachmentUrl?: string;
  attachmentName?: string;
}

export class Assignment extends AggregateRoot<string> {
  #state: AssignmentState;

  private constructor(
    id: string,
    state: AssignmentState,
    metadata: { version: number; updatedAt: string; lastModifiedBy?: string },
  ) {
    super(id, metadata);
    this.#state = state;
  }

  /** Used both to create a brand-new assignment and — like Attendance — to
   * rebuild one from a persisted row (no separate reconstitute; version
   * resets to 1 on rehydration, which the repository documents as lossy but
   * acceptable since nothing here relies on optimistic concurrency yet). */
  static create(input: CreateAssignmentInput): Assignment {
    const assignment = new Assignment(
      input.id,
      {
        classId: input.classId,
        subjectId: input.subjectId,
        teacherId: input.teacherId,
        title: input.title,
        type: input.type,
        status: input.status,
        instructions: input.instructions,
        dueDate: input.dueDate,
        totalMarks: input.totalMarks,
        attachmentUrl: input.attachmentUrl,
        attachmentName: input.attachmentName,
      },
      { version: 1, updatedAt: input.occurredAt, lastModifiedBy: input.teacherId },
    );
    const event: AssignmentCreatedEvent = {
      name: 'AssignmentCreated',
      aggregateId: assignment.id,
      occurredAt: input.occurredAt,
      classId: input.classId,
      teacherId: input.teacherId,
    };
    assignment.addEvent(event);
    return assignment;
  }

  get classId(): string {
    return this.#state.classId;
  }
  get subjectId(): string | undefined {
    return this.#state.subjectId;
  }
  get teacherId(): string {
    return this.#state.teacherId;
  }
  get title(): string {
    return this.#state.title;
  }
  get type(): AssignmentType {
    return this.#state.type;
  }
  get status(): AssignmentStatus {
    return this.#state.status;
  }
  get instructions(): string | undefined {
    return this.#state.instructions;
  }
  get dueDate(): string {
    return this.#state.dueDate;
  }
  get totalMarks(): number | undefined {
    return this.#state.totalMarks;
  }
  get attachmentUrl(): string | undefined {
    return this.#state.attachmentUrl;
  }
  get attachmentName(): string | undefined {
    return this.#state.attachmentName;
  }

  /** Flexible partial update — mirrors the web backend's PATCH semantics
   * (any subset of fields, `classId`/`teacherId` never change after creation).
   * `undefined` entries in `fields` mean "not provided", not "clear this
   * field" — they're dropped rather than spread, so an omitted field keeps
   * its current value instead of being wiped out. */
  update(fields: UpdateAssignmentFields, by: string, at: string): void {
    const patch = Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined),
    );
    this.#state = { ...this.#state, ...patch };
    this.touch(by, at);
    const event: AssignmentUpdatedEvent = {
      name: 'AssignmentUpdated',
      aggregateId: this.id,
      occurredAt: at,
    };
    this.addEvent(event);
  }
}
