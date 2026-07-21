import { AggregateRoot, guard } from '../../core';
import { BusinessRuleViolationException } from '../../exceptions';
import type { GradeLevel } from '@nemis-desktop/types';
import type { ClassCreatedEvent } from '../events/class-created';

const CAPACITY_MIN = 1;
const CAPACITY_MAX = 1000;

function guardCapacity(capacity: number | undefined): number | undefined {
  if (capacity === undefined) return undefined;
  if (!Number.isInteger(capacity)) {
    throw new BusinessRuleViolationException('capacity must be a whole number');
  }
  return guard.range(capacity, CAPACITY_MIN, CAPACITY_MAX, 'capacity');
}

export interface CreateClassInput {
  id: string;
  institutionId: string;
  academicYearId: string;
  name: string;
  section?: string;
  gradeLevel: GradeLevel;
  capacity?: number;
  occurredAt: string;
}

export interface ReconstituteClassInput {
  id: string;
  institutionId: string;
  academicYearId: string;
  name: string;
  section?: string;
  gradeLevel: GradeLevel;
  capacity?: number;
  isActive: boolean;
  version: number;
  updatedAt: string;
  lastModifiedBy?: string;
}

export interface UpdateClassFields {
  name?: string;
  /** null clears the section; undefined leaves it unchanged. */
  section?: string | null;
  gradeLevel?: GradeLevel;
  /** null clears the capacity; undefined leaves it unchanged. */
  capacity?: number | null;
}

export class Class extends AggregateRoot<string> {
  #institutionId: string;
  #academicYearId: string;
  #name: string;
  #section?: string;
  #gradeLevel: GradeLevel;
  #capacity?: number;
  #isActive: boolean;

  private constructor(
    id: string,
    fields: {
      institutionId: string;
      academicYearId: string;
      name: string;
      section?: string;
      gradeLevel: GradeLevel;
      capacity?: number;
      isActive: boolean;
    },
    metadata: { version: number; updatedAt: string; lastModifiedBy?: string },
  ) {
    super(id, metadata);
    this.#institutionId = fields.institutionId;
    this.#academicYearId = fields.academicYearId;
    this.#name = fields.name;
    this.#section = fields.section;
    this.#gradeLevel = fields.gradeLevel;
    this.#capacity = fields.capacity;
    this.#isActive = fields.isActive;
  }

  static create(input: CreateClassInput): Class {
    const entity = new Class(
      input.id,
      {
        institutionId: input.institutionId,
        academicYearId: input.academicYearId,
        name: guard.againstEmpty(input.name, 'name'),
        section: input.section?.trim() || undefined,
        gradeLevel: input.gradeLevel,
        capacity: guardCapacity(input.capacity),
        isActive: true,
      },
      { version: 1, updatedAt: input.occurredAt },
    );
    const event: ClassCreatedEvent = {
      name: 'ClassCreated',
      aggregateId: entity.id,
      occurredAt: input.occurredAt,
      institutionId: entity.institutionId,
      academicYearId: entity.academicYearId,
      className: entity.name,
    };
    entity.addEvent(event);
    return entity;
  }

  static reconstitute(input: ReconstituteClassInput): Class {
    return new Class(
      input.id,
      {
        institutionId: input.institutionId,
        academicYearId: input.academicYearId,
        name: guard.againstEmpty(input.name, 'name'),
        section: input.section,
        gradeLevel: input.gradeLevel,
        capacity: input.capacity,
        isActive: input.isActive,
      },
      { version: input.version, updatedAt: input.updatedAt, lastModifiedBy: input.lastModifiedBy },
    );
  }

  get institutionId(): string {
    return this.#institutionId;
  }
  get academicYearId(): string {
    return this.#academicYearId;
  }
  get name(): string {
    return this.#name;
  }
  get section(): string | undefined {
    return this.#section;
  }
  get gradeLevel(): GradeLevel {
    return this.#gradeLevel;
  }
  get capacity(): number | undefined {
    return this.#capacity;
  }
  get isActive(): boolean {
    return this.#isActive;
  }

  update(fields: UpdateClassFields, by: string, at: string): void {
    if (fields.name !== undefined) this.#name = guard.againstEmpty(fields.name, 'name');
    if (fields.section !== undefined) {
      this.#section = fields.section === null ? undefined : fields.section.trim() || undefined;
    }
    if (fields.gradeLevel !== undefined) this.#gradeLevel = fields.gradeLevel;
    if (fields.capacity !== undefined) {
      this.#capacity = fields.capacity === null ? undefined : guardCapacity(fields.capacity);
    }
    this.touch(by, at);
  }

  deactivate(by: string, at: string): void {
    if (!this.#isActive) return;
    this.#isActive = false;
    this.touch(by, at);
  }

  activate(by: string, at: string): void {
    if (this.#isActive) return;
    this.#isActive = true;
    this.touch(by, at);
  }
}
