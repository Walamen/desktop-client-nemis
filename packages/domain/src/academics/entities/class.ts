import { AggregateRoot } from '../../core';
import { guard } from '../../core';
import type { GradeLevel } from '@nemis-desktop/types';

interface ReconstituteClassInput {
  id: string;
  institutionId: string;
  academicYearId: string;
  name: string;
  gradeLevel: GradeLevel;
  capacity?: number;
  isActive: boolean;
  version: number;
  updatedAt: string;
  lastModifiedBy?: string;
}

export class Class extends AggregateRoot<string> {
  #institutionId: string;
  #academicYearId: string;
  #name: string;
  #gradeLevel: GradeLevel;
  #capacity?: number;
  #isActive: boolean;

  private constructor(
    id: string,
    fields: {
      institutionId: string;
      academicYearId: string;
      name: string;
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
    this.#gradeLevel = fields.gradeLevel;
    this.#capacity = fields.capacity;
    this.#isActive = fields.isActive;
  }

  static reconstitute(input: ReconstituteClassInput): Class {
    return new Class(
      input.id,
      {
        institutionId: input.institutionId,
        academicYearId: input.academicYearId,
        name: guard.againstEmpty(input.name, 'name'),
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
  get gradeLevel(): GradeLevel {
    return this.#gradeLevel;
  }
  get capacity(): number | undefined {
    return this.#capacity;
  }
  get isActive(): boolean {
    return this.#isActive;
  }
}
