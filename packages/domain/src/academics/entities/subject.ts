import { AggregateRoot } from '../../core';
import { guard } from '../../core';

interface ReconstituteSubjectInput {
  id: string;
  institutionId: string;
  name: string;
  code: string;
  isActive: boolean;
  version: number;
  updatedAt: string;
  lastModifiedBy?: string;
}

export class Subject extends AggregateRoot<string> {
  #institutionId: string;
  #name: string;
  #code: string;
  #isActive: boolean;

  private constructor(
    id: string,
    institutionId: string,
    name: string,
    code: string,
    isActive: boolean,
    metadata: { version: number; updatedAt: string; lastModifiedBy?: string },
  ) {
    super(id, metadata);
    this.#institutionId = institutionId;
    this.#name = name;
    this.#code = code;
    this.#isActive = isActive;
  }

  static reconstitute(input: ReconstituteSubjectInput): Subject {
    return new Subject(
      input.id,
      input.institutionId,
      guard.againstEmpty(input.name, 'name'),
      guard.againstEmpty(input.code, 'code'),
      input.isActive,
      { version: input.version, updatedAt: input.updatedAt, lastModifiedBy: input.lastModifiedBy },
    );
  }

  get institutionId(): string {
    return this.#institutionId;
  }
  get name(): string {
    return this.#name;
  }
  get code(): string {
    return this.#code;
  }
  get isActive(): boolean {
    return this.#isActive;
  }
}
