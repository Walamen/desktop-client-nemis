import { AggregateRoot } from '../../core';
import { Marks } from '../../value-objects';
import type { AssessmentType } from '@nemis-desktop/types';
import type { AssessmentCreatedEvent } from '../events/assessment-events';

interface AssessmentState {
  classId: string;
  subjectId: string;
  gradingPeriodId: string;
  type: AssessmentType;
  marks: Marks;
}

export interface CreateAssessmentInput {
  id: string;
  classId: string;
  subjectId: string;
  gradingPeriodId: string;
  type: AssessmentType;
  totalMarks: number;
  occurredAt: string;
}

export class Assessment extends AggregateRoot<string> {
  #state: AssessmentState;

  private constructor(
    id: string,
    state: AssessmentState,
    metadata: { version: number; updatedAt: string; lastModifiedBy?: string },
  ) {
    super(id, metadata);
    this.#state = state;
  }

  static create(input: CreateAssessmentInput): Assessment {
    const assessment = new Assessment(
      input.id,
      {
        classId: input.classId,
        subjectId: input.subjectId,
        gradingPeriodId: input.gradingPeriodId,
        type: input.type,
        marks: Marks.create({ obtained: 0, total: input.totalMarks }),
      },
      { version: 1, updatedAt: input.occurredAt },
    );
    const event: AssessmentCreatedEvent = {
      name: 'AssessmentCreated',
      aggregateId: assessment.id,
      occurredAt: input.occurredAt,
      classId: input.classId,
      subjectId: input.subjectId,
    };
    assessment.addEvent(event);
    return assessment;
  }

  get type(): AssessmentType {
    return this.#state.type;
  }
  get marks(): Marks {
    return this.#state.marks;
  }
}
